from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class StatusCount(BaseModel):
    status: str
    count: int


class DailyActivity(BaseModel):
    day: date
    total_imports: int
    successful_imports: int
    failed_imports: int
    rows_loaded: int
    success_rate: float


class RecentImport(BaseModel):
    id: int
    filename: str
    status: str
    rows_inserted: int
    uploaded_at: datetime
    user_name: Optional[str] = None
    organization_name: Optional[str] = None


class DashboardOverview(BaseModel):
    scope: str
    scope_name: str
    days: int
    total_imports: int
    successful_imports: int
    failed_imports: int
    in_progress_imports: int
    success_rate: float
    total_rows_loaded: int
    avg_rows_per_successful_import: float
    by_status: list[StatusCount] = Field(default_factory=list)
    activity_by_day: list[DailyActivity] = Field(default_factory=list)
    recent_imports: list[RecentImport] = Field(default_factory=list)
