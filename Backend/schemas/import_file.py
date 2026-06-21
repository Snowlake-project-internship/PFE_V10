from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ImportFileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    organization_id: Optional[int] = None
    organization_name: Optional[str] = None
    entreprise_name: str
    database_name: str
    schema_name: str
    original_filename: str
    uploaded_at: datetime
    rows_inserted: Optional[int] = 0
    imported_tables: Optional[List[str]] = None
    status: Optional[str] = "PENDING"
    rollback_status: Optional[str] = "PENDING"
    rollback_query: Optional[str] = None
    rollback_plan: Optional[Dict[str, Any]] = None
    rolled_back_at: Optional[datetime] = None
    rollback_error_message: Optional[str] = None
    rollback_failed_at: Optional[datetime] = None
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    failure_step: Optional[str] = None
    sql_error_details: Optional[str] = None
    failed_at: Optional[datetime] = None
    failed_table_name: Optional[str] = None

class ImportUploadResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool
    database: str
    schema_name: str = Field(serialization_alias="schema", validation_alias="schema")
    tables_created: List[str]
    rows_inserted: int
    import_id: int


class ImportAnalyzeResponse(BaseModel):
    session_id: str
    org_name: str
    database: str
    schema_name: str = Field(serialization_alias="schema", validation_alias="schema")
    org_exists: bool
    preview: Dict[str, Dict[str, Any]]
    duplicates: Dict[str, Dict[str, Any]]
    has_duplicates: bool
    invalid_values: Dict[str, Dict[str, Any]]
    has_invalid_values: bool
    quality_summary: Dict[str, Any]
    can_import: bool
    blocking_issues: List[str]
    existing_tables: List[str]
    new_tables: List[str]


class ImportConfirmRequest(BaseModel):
    session_id: str


class ImportRollbackResponse(BaseModel):
    success: bool
    import_id: int
    rollback_status: str
    rolled_back_at: Optional[datetime] = None
    message: Optional[str] = None


class ImportRollbackReadinessResponse(BaseModel):
    import_id: int
    available: bool
    rollback_status: str
    reason: Optional[str] = None
    rollback_query: Optional[str] = None
