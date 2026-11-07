"""Convert bundled CC0 recordings and generate the original beans icon."""

import ctypes
import ctypes.util
import hashlib
import json
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parent / "resource"


class SoundInfo(ctypes.Structure):
    _fields_ = [
        ("frames", ctypes.c_int64),
        ("samplerate", ctypes.c_int),
        ("channels", ctypes.c_int),
        ("format", ctypes.c_int),
        ("sections", ctypes.c_int),
        ("seekable", ctypes.c_int),
    ]


def generate_sounds():
    library = ctypes.util.find_library("sndfile")
    if not library:
        raise RuntimeError("Install libsndfile with MP3/Vorbis support to convert recordings.")
    encoder = ctypes.CDLL(library)
    encoder.sf_open.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.POINTER(SoundInfo)]
    encoder.sf_open.restype = ctypes.c_void_p
    encoder.sf_read_float.argtypes = [
        ctypes.c_void_p, ctypes.POINTER(ctypes.c_float), ctypes.c_int64
    ]
    encoder.sf_read_float.restype = ctypes.c_int64
    encoder.sf_write_float.argtypes = [
        ctypes.c_void_p, ctypes.POINTER(ctypes.c_float), ctypes.c_int64
    ]
    encoder.sf_write_float.restype = ctypes.c_int64
    encoder.sf_close.argtypes = [ctypes.c_void_p]
    encoder.sf_close.restype = ctypes.c_int
    encoder.sf_strerror.argtypes = [ctypes.c_void_p]
    encoder.sf_strerror.restype = ctypes.c_char_p
    destination = ROOT / "sounds" / "fart"
    destination.mkdir(parents=True, exist_ok=True)
    credits = json.loads((ROOT / "sounds" / "credits.json").read_text())
    recordings = {}
    for identifier, recording in credits["recordings"].items():
        path = ROOT.parent / "audio-sources" / recording["file"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != recording["sha256"]:
            raise RuntimeError(f"Source recording checksum mismatch: {path}")
        info = SoundInfo()
        handle = encoder.sf_open(str(path).encode(), 0x10, ctypes.byref(info))
        if not handle:
            raise RuntimeError(encoder.sf_strerror(None).decode())
        try:
            count = info.frames * info.channels
            samples = (ctypes.c_float * count)()
            if encoder.sf_read_float(handle, samples, count) != count:
                raise RuntimeError(f"Could not decode all samples in {path}")
            recordings[identifier] = (info, samples)
        finally:
            if encoder.sf_close(handle) != 0:
                raise RuntimeError(f"Failed to close {path}")

    for clip in credits["clips"]:
        source_info, source = recordings[clip["recording"]]
        rate = source_info.samplerate
        count = round(clip["duration"] * rate)
        start = round(clip["start"] * rate)
        if start < 0 or start + count > source_info.frames:
            raise RuntimeError(f"Clip is outside source recording: {clip['name']}")
        samples = (ctypes.c_float * count)()
        channels = source_info.channels
        for index in range(count):
            offset = (start + index) * channels
            samples[index] = sum(source[offset + channel] for channel in range(channels)) / channels
        peak = max(abs(sample) for sample in samples)
        if peak < 0.001:
            raise RuntimeError(f"Clip contains no usable audio: {clip['name']}")
        fade = round(rate * 0.01)
        for index in range(count):
            envelope = min(1, index / fade, (count - 1 - index) / fade)
            samples[index] *= (0.85 / peak) * envelope
        info = SoundInfo(0, rate, 1, 0x200000 | 0x0060, 0, 0)  # Ogg Vorbis, mono
        path = destination / f"{clip['name']}.ogg"
        handle = encoder.sf_open(str(path).encode(), 0x20, ctypes.byref(info))
        if not handle:
            raise RuntimeError(encoder.sf_strerror(None).decode())
        try:
            if encoder.sf_write_float(handle, samples, count) != count:
                raise RuntimeError(encoder.sf_strerror(handle).decode())
        finally:
            if encoder.sf_close(handle) != 0:
                raise RuntimeError(f"Failed to close {path}")
        print(f"Converted {path} ({clip['duration']}s)")


def generate_texture():
    palette = {
        ".": (0, 0, 0, 0),
        "#": (60, 65, 71, 255),
        "s": (164, 178, 187, 255),
        "h": (227, 234, 237, 255),
        "r": (164, 44, 36, 255),
        "c": (243, 223, 165, 255),
        "b": (166, 94, 46, 255),
    }
    rows = [
        "................",
        "................",
        "....########....",
        "...#sshhhsss#...",
        "...#hsssssss#...",
        "...#rrrrrrrr#...",
        "...#rccccccr#...",
        "...#rcbbcbcr#...",
        "...#rcbcbbcr#...",
        "...#rcbbcbcr#...",
        "...#rccccccr#...",
        "...#rrrrrrrr#...",
        "...#sssssssh#...",
        "...#sshhhsss#...",
        "....########....",
        "................",
    ]

    def chunk(kind, data):
        return (
            struct.pack(">I", len(data)) + kind + data
            + struct.pack(">I", zlib.crc32(kind + data))
        )

    pixels = b"".join(
        b"\0" + b"".join(bytes(palette[pixel]) for pixel in row) for row in rows
    )
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", 16, 16, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(pixels))
    png += chunk(b"IEND", b"")
    path = ROOT / "textures" / "items" / "tin_of_beans.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)
    print(f"Generated {path}")


if __name__ == "__main__":
    generate_sounds()
    generate_texture()
