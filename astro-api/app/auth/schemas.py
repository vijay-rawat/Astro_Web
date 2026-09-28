"""Request and reply shapes. JSON uses camelCase to match the web app's TypeScript types."""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator
from pydantic.alias_generators import to_camel

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Secret = Annotated[str, StringConstraints(min_length=1, max_length=256)]
Token = Annotated[str, StringConstraints(min_length=16, max_length=128)]
Transcript = Annotated[str, StringConstraints(max_length=240)]


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class _EmailIn(Camel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.strip().lower()


class SignupIn(_EmailIn):
    name: Name
    password: Secret
    company_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None


class LoginIn(_EmailIn):
    password: Secret
    remember: bool = False


class VoiceLoginIn(_EmailIn):
    transcripts: list[Transcript] = Field(min_length=1, max_length=3)
    remember: bool = False


class EmailIn(_EmailIn):
    pass


class TokenIn(Camel):
    token: Token


class ResetIn(Camel):
    token: Token
    password: Secret


class VoiceSetupIn(Camel):
    password: Secret
    phrase: Transcript
    confirm: Transcript


class PasswordIn(Camel):
    password: Secret


class UserOut(Camel):
    id: uuid.UUID
    name: str
    email: str
    initials: str
    roles: list[str]
    role_label: str
    can_manage: bool
    voice_enabled: bool


class CompanyOut(Camel):
    id: uuid.UUID
    name: str
    initials: str
    preset: str
    preset_label: str


class MeOut(Camel):
    user: UserOut
    company: CompanyOut


class AcceptedOut(Camel):
    status: str


class SessionOut(Camel):
    id: uuid.UUID
    current: bool
    method: str
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    ip: str | None
    user_agent: str | None
