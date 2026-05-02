from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


_fernet: Fernet | None = None


def _cipher() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(settings.MASTER_KEY.encode("utf-8"))
    return _fernet


def encrypt(plaintext: str) -> str:
    return _cipher().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(ciphertext: str) -> str:
    try:
        return _cipher().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as e:
        raise ValueError("Could not decrypt: master key mismatch or corrupted ciphertext") from e
