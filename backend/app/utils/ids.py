import uuid

from uuid6 import uuid7


def generate_id() -> uuid.UUID:
    return uuid7()


def generate_id_str() -> str:
    return str(generate_id())

