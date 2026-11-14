"""Verify signed workflows retain actions AND iOS 27 triggers before delivery."""
from pathlib import Path
import plistlib,struct

def assert_workflow(expected,actual):
    # Existing signer may normalize presentation metadata; it must never drop
    # triggers, executable actions, input types, or UUID dataflow references.
    allowed={'WFWorkflowName','WFQuickActionSurfaces','WFWorkflowClientVersion','WFWorkflowOutputContentItemClasses','WFWorkflowHasOutputFallback'}
    for key in expected.keys()|actual.keys():
        if key not in allowed and expected.get(key)!=actual.get(key):
            raise ValueError('Signing changed required workflow field: '+key)

def decode(path):
    import aea
    from cryptography import x509
    from cryptography.hazmat.primitives import serialization
    b=Path(path).read_bytes()
    if not b.startswith(b'AEA1'):raise ValueError('Not a signed Shortcut')
    size=struct.unpack_from('<I',b,8)[0]
    meta=plistlib.loads(b[12:12+size])
    cert=x509.load_der_x509_certificate(meta['SigningCertificateChain'][0])
    key=cert.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
    payload=aea.decode(b,signature_pub=key)
    index=payload.find(b'bplist00')
    if index<0:raise ValueError('No workflow in signed archive')
    return plistlib.loads(payload[index:])

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('expected');parser.add_argument('signed');args=parser.parse_args()
    assert_workflow(plistlib.loads(Path(args.expected).read_bytes()),decode(args.signed))
    print('Signature, actions, dataflow, trigger and input metadata verified')
