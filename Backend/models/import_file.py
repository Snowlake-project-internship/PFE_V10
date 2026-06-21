from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class ImportFile(Base):
    __tablename__ = "import_files"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    entreprise_name = Column(String(255), nullable=False)
    database_name = Column(String(255), nullable=False)
    schema_name = Column(String(255), nullable=False)
    original_filename = Column(String(500), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    rows_inserted = Column(Integer, nullable=False, default=0)
    imported_tables = Column(JSON, nullable=True)
    status = Column(String(40), nullable=False, default="PENDING", index=True)
    rollback_status = Column(String(40), nullable=False, default="PENDING", index=True)
    rollback_query = Column(Text, nullable=True)
    rollback_plan = Column(JSON, nullable=True)
    rolled_back_at = Column(DateTime, nullable=True)
    rollback_error_message = Column(Text, nullable=True)
    rollback_failed_at = Column(DateTime, nullable=True)
    error_type = Column(String(255), nullable=True)
    error_message = Column(Text, nullable=True)
    failure_step = Column(String(255), nullable=True)
    sql_error_details = Column(Text, nullable=True)
    failed_at = Column(DateTime, nullable=True)
    failed_table_name = Column(String(500), nullable=True)

    user = relationship("User")
    organization = relationship("Organization")

    @property
    def user_name(self) -> str | None:
        return self.user.username if self.user else None

    @property
    def organization_name(self) -> str | None:
        return self.organization.name if self.organization else None
