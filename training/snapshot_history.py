"""Read-only RTDB export using the same URL/encoding as the application."""
import json
import re
import urllib.parse
import urllib.request

from prepare_dataset import ROOT


def decode(value):
    if isinstance(value, list):
        return [decode(v) for v in value]
    if isinstance(value, dict):
        return {urllib.parse.unquote(k): decode(v) for k, v in value.items()}
    return value


if __name__ == '__main__':
    source = (ROOT / 'src/commands/rtdb-query-store.js').read_text(encoding='utf-8')
    url = re.search(r"const databaseURL='([^']+)'", source).group(1)
    with urllib.request.urlopen(url.rstrip('/') + '/usagi/conversationLogs.json', timeout=20) as response:
        data = json.load(response)
    rows = [decode(v['record']) for v in (data or {}).values() if v and v.get('storage', {}).get('encoding') == 'percent-key-v1']
    target = ROOT / 'training/snapshots/rtdb-history.jsonl'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows), encoding='utf-8')
    print('Snapshot records:', len(rows))
