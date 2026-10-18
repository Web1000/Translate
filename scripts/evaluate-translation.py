"""Compare app ONNX, original Marian tokenization, and the Argos model backend.

Research-only Python dependencies and weights are not bundled with the app.
Argos inference uses its SentencePiece/CTranslate2 backend with the app's same
normalized chunks and Argos decoding settings, rather than a hosted API or SBD.
"""
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '.cache/translation-evaluation'
PACK = ROOT / '.cache/language-packs/opus-zh-en-q8-v1'
REPORT = OUT / 'report.json'


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def download(url, path, limit=1024 * 1024 * 1024, user_agent=None):
    if not url.startswith('https://'):
        raise ValueError('HTTPS required')
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={'User-Agent': user_agent} if user_agent else {})
    with urllib.request.urlopen(request, timeout=180) as response, path.open('wb') as target:
        if not response.url.startswith('https://'):
            raise ValueError('HTTPS redirect required')
        size = 0
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                raise ValueError('Download exceeded size limit')
            target.write(chunk)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def reference_tokenizer(manifest):
    from transformers import MarianTokenizer
    directory = OUT / 'marian-tokenizer'
    metadata_path = OUT / 'model-metadata.json'
    download(f"https://huggingface.co/api/models/{manifest['model']}/revision/{manifest['revision']}?blobs=true", metadata_path, 4 * 1024 * 1024)
    metadata = read_json(metadata_path)
    assert metadata['sha'] == manifest['revision']
    files = {item['rfilename']: item for item in metadata['siblings']}
    for name in ['source.spm', 'target.spm', 'vocab.json']:
        path = directory / name
        download(f"https://huggingface.co/{manifest['model']}/resolve/{manifest['revision']}/{name}", path, 50 * 1024 * 1024)
        blob = path.read_bytes()
        description = files[name]
        if description.get('lfs'):
            assert hashlib.sha256(blob).hexdigest() == description['lfs']['sha256']
            assert len(blob) == description['lfs']['size']
        else:
            assert hashlib.sha1(f'blob {len(blob)}\0'.encode() + blob).hexdigest() == description['blobId']
            assert len(blob) == description['size']
    shutil.copyfile(PACK / 'tokenizer_config.json', directory / 'tokenizer_config.json')
    return MarianTokenizer.from_pretrained(directory, local_files_only=True)


def evaluate_argos(cases):
    import ctranslate2
    import sentencepiece
    import psutil
    index = OUT / 'argos-index.json'
    index_sha = download('https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json', index, 4 * 1024 * 1024)
    entry = next(item for item in read_json(index) if item.get('from_code') == 'zh' and item.get('to_code') == 'en' and item.get('package_version') == '1.9')
    archive = OUT / 'zh-en.argosmodel'
    # Match the supported upstream client protocol (argostranslate.networking).
    package_sha = download(entry['links'][0], archive, user_agent='ArgosTranslate')
    extracted = OUT / 'argos'
    with zipfile.ZipFile(archive) as bundle:
        total = 0
        for member in bundle.infolist():
            destination = (extracted / member.filename).resolve()
            if not destination.is_relative_to(extracted.resolve()) or (member.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Unsafe package path')
            total += member.file_size
            if total > 2 * 1024 * 1024 * 1024:
                raise ValueError('Unpacked package exceeded limit')
        bundle.extractall(extracted)
    metadata_path = next(extracted.rglob('metadata.json'))
    directory = metadata_path.parent
    metadata = read_json(metadata_path)
    assert metadata['from_code'] == 'zh' and metadata['to_code'] == 'en'
    processor = sentencepiece.SentencePieceProcessor(model_file=str(directory / 'sentencepiece.model'))
    started = time.perf_counter()
    translator = ctranslate2.Translator(str(directory / 'model'), device='cpu', compute_type='int8', inter_threads=1, intra_threads=2)

    def translate(text):
        prefix = metadata.get('target_prefix', '')
        result = translator.translate_batch([processor.encode(text, out_type=str)],
            target_prefix=[[prefix]] if prefix else None,
            beam_size=4, num_hypotheses=1, replace_unknowns=True,
            length_penalty=0.2, max_decoding_length=384)
        value = processor.decode(result[0].hypotheses[0]).replace('▁', ' ').replace('_', ' ')
        if prefix and value.startswith(prefix):
            value = value[len(prefix):]
        return value.strip()

    translate('你好。')
    warm_ms = round(1000 * (time.perf_counter() - started))
    results = []
    for case in cases:
        started = time.perf_counter()
        output = ''.join(translate(chunk['text']) + chunk['separator'] for chunk in case['chunks']).strip()
        assert output
        results.append({'id': case['id'], 'text': output, 'elapsedMs': round(1000 * (time.perf_counter() - started))})
    licenses = {str(path.relative_to(directory)): path.read_text(encoding='utf-8', errors='replace')[:6000] for path in directory.rglob('*') if path.is_file() and any(name in path.name.lower() for name in ['license', 'readme'])}
    return {'label': 'Argos zh-en 1.9 CTranslate2 backend (not hosted LibreTranslate)',
        'indexSha256': index_sha, 'packageSha256': package_sha, 'source': entry,
        'metadata': metadata, 'licenses': licenses, 'downloadBytes': archive.stat().st_size,
        'warmMs': warm_ms, 'processRssMB': round(psutil.Process().memory_info().rss / 1048576), 'results': results}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'status': 'running', 'platform': platform.platform(), 'cpu': platform.processor(), 'cpuThreads': 2,
        'python': platform.python_version(), 'cases': [],
        'limitations': 'Diagnostic, manually authored cases; not a representative quality score. All engines use app OpenCC normalization/chunks. Reference tokenizer timings exclude Python encoding/decoding. Argos backend uses beam 4 versus OPUS beam 1; this affects speed and quality.'}
    try:
        cases = read_json(OUT / 'prepared-cases.json')
        report['versions'] = {name: importlib.metadata.version(name) for name in ['ctranslate2', 'sentencepiece', 'transformers']}
        manifest = read_json(PACK / 'pack.json')
        report['model'] = {key: manifest[key] for key in ['model', 'revision', 'license', 'licenseSource']}
        tokenizer = reference_tokenizer(manifest)
        for case in cases:
            for chunk in case['chunks']:
                chunk['ids'] = tokenizer(chunk['text'])['input_ids']
        (OUT / 'encoded-cases.json').write_text(json.dumps(cases, ensure_ascii=False), encoding='utf-8')
        subprocess.run(['node', str(ROOT / 'scripts/evaluate-onnx.cjs'), str(PACK), str(OUT)], check=True, timeout=600)
        onnx = read_json(OUT / 'onnx-results.json')
        report['onnx'] = {key: value for key, value in onnx.items() if key != 'results'}
        for case, result in zip(cases, onnx['results']):
            assert case['id'] == result['id']
            reference = ''.join(tokenizer.decode(chunk['ids'], skip_special_tokens=True, clean_up_tokenization_spaces=False).strip() + chunk['separator'] for chunk in result['generated']).strip()
            report['cases'].append({'id': case['id'], 'kind': case['kind'], 'input': case['input'], 'referenceMeaning': case['reference'],
                'current': result['baseline'], 'currentMs': result['baselineMs'],
                'marianReference': reference, 'marianReferenceMs': result['referenceMs'],
                'tokenDifferences': result['tokenDifferences']})
        REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
        report['argos'] = evaluate_argos(cases)
        for case, argos in zip(report['cases'], report['argos']['results']):
            assert case['id'] == argos['id']
            case['argos'] = argos['text']
            case['argosMs'] = argos['elapsedMs']
        report['status'] = 'completed'
    except Exception as error:
        report['status'] = 'failed'
        report['error'] = f'{type(error).__name__}: {error}'
        raise
    finally:
        REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
        print(json.dumps({'status': report['status'], 'cases': len(report['cases']), 'error': report.get('error')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
