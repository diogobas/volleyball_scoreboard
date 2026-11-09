#!/usr/bin/env python3
"""Create a local Google Play upload key once, without printing its passwords."""
import os
from pathlib import Path
import secrets
import shutil
import subprocess

root = Path(__file__).resolve().parent.parent
directory = root / 'artifacts/android/signing'
keystore = directory / 'volleyball-upload.jks'
properties = root / 'android/keystore.properties'
if properties.exists() or keystore.exists():
    if properties.exists() and keystore.exists():
        print('Existing upload key and signing settings kept.')
        raise SystemExit(0)
    raise SystemExit('Signing files already partially exist. Restore/configure them instead of creating a replacement key.')
keytool = shutil.which('keytool')
if not keytool:
    raise SystemExit('Install/select JDK 21 with keytool first.')
directory.mkdir(parents=True, exist_ok=True)
directory.chmod(0o700)
password = secrets.token_urlsafe(32)
environment = {**os.environ, 'VB_UPLOAD_STORE_PASS': password, 'VB_UPLOAD_KEY_PASS': password}
subprocess.run([keytool, '-genkeypair', '-keystore', str(keystore), '-alias', 'volleyball-upload',
    '-storepass:env', 'VB_UPLOAD_STORE_PASS', '-keypass:env', 'VB_UPLOAD_KEY_PASS', '-storetype', 'JKS',
    '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000',
    '-dname', 'CN=Volleyball Scoreboard Upload', '-noprompt'], env=environment, check=True)
keystore.chmod(0o600)
content = f'storeFile=../artifacts/android/signing/volleyball-upload.jks\nstorePassword={password}\nkeyAlias=volleyball-upload\nkeyPassword={password}\n'
descriptor = os.open(properties, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(descriptor, 'w') as file:
    file.write(content)
print('Upload key created at artifacts/android/signing/volleyball-upload.jks')
print('Passwords are in ignored android/keystore.properties. Back up both files privately.')
