# Independent Rasa environment

The Rasa runtime stays in this project's `.venv-rasa`; it is not shared with other projects.
Package downloads/unpacked wheels use the shared `D:\CODEX\.uv-cache` cache through `uv.toml`.

Reproduce the existing 165 pinned packages:

```powershell
uv venv --relocatable --python 3.10 .venv-rasa
uv pip sync --python .venv-rasa/Scripts/python.exe requirements-rasa.lock.txt
```

The migration preserved versions and verified Rasa/TensorFlow/NumPy imports and CLI help.
It did not run training, inference, or BI queries.

The pre-existing environment reports `tensorflow-intel`'s missing `jax>=0.3.15` dependency.
This warning was retained rather than changing the working TensorFlow 2.12 / NumPy stack.
The Qwen inference runtime and any future Qwen training environment are separate from Rasa.
