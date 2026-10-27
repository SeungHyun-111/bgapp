# LEGACY DISABLED 2026-10-27: preserved during Gemini migration.
# """Offline Qwen LoRA/QLoRA worker. No installation or download is performed.
#
# Only explicitly supervised JSON value spans receive loss. Unconfirmed plan
# tokens, prompts, and tool results are masked with -100.
# """
# import argparse
# import json
# import math
# import os
# import pathlib
#
#
# def json_spans(value):
#     chunks, spans, position = [], {}, 0
#
#     def emit(text):
#         nonlocal position
#         chunks.append(text)
#         position += len(text)
#
#     def visit(node, pointer):
#         start = position
#         if isinstance(node, dict):
#             emit('{')
#             for i, (key, child) in enumerate(node.items()):
#                 if i:
#                     emit(',')
#                 emit(json.dumps(key, ensure_ascii=False) + ':')
#                 visit(child, pointer + '/' + key.replace('~', '~0').replace('/', '~1'))
#             emit('}')
#         elif isinstance(node, list):
#             emit('[')
#             for i, child in enumerate(node):
#                 if i:
#                     emit(',')
#                 visit(child, pointer + '/' + str(i))
#             emit(']')
#         else:
#             emit(json.dumps(node, ensure_ascii=False, allow_nan=False))
#             spans[pointer] = (start, position)
#     visit(value, '')
#     return ''.join(chunks), spans
#
#
# def masked_tokens(sample, tokenizer, max_length):
#     answer, spans = json_spans(sample['answer'])
#     messages = sample['messages'] + [{'role': 'assistant', 'content': answer}]
#     rendered = tokenizer.apply_chat_template(messages, tokenize=False,
#                                             add_generation_prompt=False,
#                                             enable_thinking=False)
#     start = rendered.rfind(answer)
#     if start < 0:
#         raise ValueError('Assistant JSON not found in chat template')
#     approved = []
#     for pointer in sample['supervisedPaths']:
#         if pointer not in spans:
#             raise ValueError('Supervision must address a scalar JSON value: ' + pointer)
#         a, b = spans[pointer]
#         approved.append((start + a, start + b))
#     encoded = tokenizer(rendered, add_special_tokens=False,
#                         return_offsets_mapping=True, truncation=False)
#     if len(encoded['input_ids']) > max_length:
#         raise ValueError(f"Sample {sample['id']} needs {len(encoded['input_ids'])} tokens; refusing to truncate correction labels")
#     labels = []
#     for token, (a, b) in zip(encoded['input_ids'], encoded['offset_mapping']):
#         # Boundary-spanning tokens may contain a neighbouring inferred field.
#         # Train only tokens fully contained in an explicitly approved value.
#         labels.append(token if b > a and any(a >= x and b <= y for x, y in approved) else -100)
#     if not any(label != -100 for label in labels):
#         raise ValueError('No safely supervised tokens in ' + sample['id'])
#     return {'input_ids': encoded['input_ids'], 'attention_mask': encoded['attention_mask'], 'labels': labels}
#
#
# def local_model(job):
#     model = pathlib.Path(job['baseModel']).resolve()
#     if not model.is_dir() or not (model / 'config.json').is_file():
#         raise ValueError('A local original Hugging Face model directory is required')
#     config = json.loads((model / 'config.json').read_text(encoding='utf-8'))
#     if config.get('model_type') != 'qwen3':
#         raise ValueError('Unexpected training model architecture')
#     return str(model)
#
#
# def write_report(job, stage, data):
#     dest = pathlib.Path(job['directory']) / (stage + '-report.json')
#     dest.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
#
#
# def train(job):
#     import torch
#     from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
#     from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
#     torch.manual_seed(job.get('seed', 42))
#     device = job.get('device', 'auto')
#     if device == 'auto':
#         device = 'cuda' if torch.cuda.is_available() else 'xpu' if hasattr(torch, 'xpu') and torch.xpu.is_available() else 'cpu'
#     if device == 'cuda' and not torch.cuda.is_available():
#         raise ValueError('CUDA is unavailable')
#     if device == 'xpu' and not torch.xpu.is_available():
#         raise ValueError('Intel XPU is unavailable')
#     method = job.get('method', 'qlora')
#     if method not in ('lora', 'qlora'):
#         raise ValueError('Unsupported training method')
#     if device == 'cpu' and method == 'qlora':
#         raise ValueError('This worker does not silently substitute CPU QLoRA for a supported GPU path')
#     dtype = torch.float32 if device == 'cpu' else torch.bfloat16
#     base = local_model(job)
#     tokenizer = AutoTokenizer.from_pretrained(base, local_files_only=True, use_fast=True)
#     kwargs = {'local_files_only': True, 'torch_dtype': dtype, 'attn_implementation': 'sdpa'}
#     if method == 'qlora':
#         kwargs['quantization_config'] = BitsAndBytesConfig(load_in_4bit=True,
#                                                          bnb_4bit_quant_type='nf4',
#                                                          bnb_4bit_use_double_quant=True,
#                                                          bnb_4bit_compute_dtype=dtype)
#         kwargs['device_map'] = {'': device + ':0'}
#     model = AutoModelForCausalLM.from_pretrained(base, **kwargs)
#     if method == 'qlora':
#         model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
#     else:
#         model.to(device)
#         model.gradient_checkpointing_enable()
#         model.enable_input_require_grads()
#     model.config.use_cache = False
#     model = get_peft_model(model, LoraConfig(r=job.get('rank', 8),
#                            lora_alpha=job.get('rank', 8) * 2, lora_dropout=0.05,
#                            target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj',
#                                            'gate_proj', 'up_proj', 'down_proj'],
#                            task_type='CAUSAL_LM', bias='none'))
#     samples = [json.loads(line) for line in pathlib.Path(job['trainFile']).read_text(encoding='utf-8').splitlines() if line.strip()]
#     encoded = [masked_tokens(s, tokenizer, job.get('maxLength', 4096)) for s in samples]
#     if not encoded:
#         raise ValueError('Empty training dataset')
#     trainable = {n: p for n, p in model.named_parameters() if p.requires_grad}
#     if not trainable:
#         raise ValueError('No trainable adapter parameters')
#     initial = {n: p.detach().float().cpu().clone() for n, p in trainable.items()}
#     optimizer = torch.optim.AdamW(trainable.values(), lr=job.get('learningRate', 0.0001))
#     model.train()
#     steps, losses = 0, []
#     for _ in range(job.get('epochs', 2)):
#         for row in encoded:
#             batch = {k: torch.tensor([v], device=device) for k, v in row.items()}
#             optimizer.zero_grad(set_to_none=True)
#             loss = model(**batch).loss
#             if not torch.isfinite(loss):
#                 raise ValueError('Non-finite training loss')
#             loss.backward()
#             torch.nn.utils.clip_grad_norm_(trainable.values(), 1.0)
#             optimizer.step()
#             steps += 1
#             losses.append(float(loss.detach().cpu()))
#     update = sum(float((p.detach().float().cpu() - initial[n]).square().sum()) for n, p in trainable.items()) ** 0.5
#     if not steps or not math.isfinite(update) or update <= 0:
#         raise ValueError('No verified adapter weight update')
#     dest = pathlib.Path(job['directory']) / 'adapter'
#     model.save_pretrained(dest, safe_serialization=True)
#     tokenizer.save_pretrained(dest)
#     write_report(job, 'training', {'completed': True, 'steps': steps, 'samples': len(encoded),
#                  'device': device, 'method': method, 'meanLoss': sum(losses) / len(losses),
#                  'adapterUpdateL2': update, 'trainableParameters': sum(p.numel() for p in trainable.values()),
#                  'partialFieldSupervision': True, 'baseModel': base,
#                  'datasetVersion': job['datasetVersion']})
#
#
# def merge(job):
#     import torch
#     from transformers import AutoModelForCausalLM, AutoTokenizer
#     from peft import PeftModel
#     base = local_model(job)
#     model = AutoModelForCausalLM.from_pretrained(base, local_files_only=True,
#                                                 torch_dtype=torch.bfloat16,
#                                                 low_cpu_mem_usage=True)
#     model = PeftModel.from_pretrained(model, str(pathlib.Path(job['directory']) / 'adapter'),
#                                      local_files_only=True)
#     model = model.merge_and_unload(safe_merge=True)
#     dest = pathlib.Path(job['directory']) / 'merged'
#     model.save_pretrained(dest, safe_serialization=True)
#     AutoTokenizer.from_pretrained(base, local_files_only=True).save_pretrained(dest)
#     write_report(job, 'merge', {'completed': True, 'output': str(dest), 'baseModel': base})
#
#
# if __name__ == '__main__':
#     parser = argparse.ArgumentParser()
#     parser.add_argument('stage', choices=['train', 'merge'])
#     parser.add_argument('job')
#     args = parser.parse_args()
#     # Never contact model hubs, including for missing tokenizer/config files.
#     os.environ['HF_HUB_OFFLINE'] = '1'
#     os.environ['TRANSFORMERS_OFFLINE'] = '1'
#     os.environ['HF_DATASETS_OFFLINE'] = '1'
#     job = json.loads(pathlib.Path(args.job).read_text(encoding='utf-8'))
#     (train if args.stage == 'train' else merge)(job)
raise RuntimeError('Legacy local LLM path is disabled during Gemini migration.')
