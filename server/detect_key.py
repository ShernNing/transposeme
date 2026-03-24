import sys
import essentia
import essentia.standard as es

if len(sys.argv) < 2:
    print("Usage: python detect_key.py <audiofile>")
    sys.exit(1)

audiofile = sys.argv[1]

audio = es.MonoLoader(filename=audiofile)()
key, scale, strength = es.KeyExtractor()(audio)

print(f"{key} {scale}")
