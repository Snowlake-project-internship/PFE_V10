from fastapi import APIRouter
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv
from typing import List, Optional
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()

router = APIRouter()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    image: Optional[str] = None
    role: Optional[str] = "user"
    user_id: Optional[int] = None
    user_email: Optional[str] = None
    user_name: Optional[str] = None

SYSTEM_PROMPT_USER = """
You are SnowBot, an AI assistant integrated into Snowflake Loader.
You are talking to a REGULAR USER.

YOU CAN HELP WITH:
1. Explain why their Excel import failed in simple language
2. Guide them step by step to fix their Excel file
3. Generate simple SQL SELECT queries
4. Analyze uploaded files PDF Excel CSV images
5. Answer any general question about the platform

ESCALATION RULE:
If you cannot solve the problem say exactly at the end:
ESCALATE_TO_ADMIN

LANGUAGE RULE:
Detect the language of the user message and always respond in the same language.
"""

SYSTEM_PROMPT_ADMIN = """
You are SnowBot, an AI assistant with full access to Snowflake Loader platform.
You are talking to an ADMINISTRATOR.

YOU CAN HELP WITH:
1. Analyze platform performance
2. Generate complex SQL queries on all tables
3. Summarize user feedback
4. Diagnose system errors
5. Generate reports

AVAILABLE TABLES:
- users(id, name, email, role, is_active, last_login, created_at)
- import_files(id, user_id, entreprise_name, database_name, schema_name, original_filename, uploaded_at, rows_inserted, status)

LANGUAGE RULE:
Detect the language and always respond in the same language.
"""

SYSTEM_PROMPT_VISION = """
You are an AI assistant specialized in analyzing images and screenshots
integrated into Snowflake Loader.
Analyze the image, identify the problem, propose a solution.
Respond in the same language as the user.
"""

def send_escalation_email(user_name: str, user_email: str, problem: str):
    try:
        smtp_email = os.getenv("SMTP_EMAIL")
        smtp_password = os.getenv("SMTP_PASSWORD")
        admin_email = os.getenv("ADMIN_EMAIL")

        if not all([smtp_email, smtp_password, admin_email]):
            return False

        msg = MIMEMultipart()
        msg['From'] = smtp_email
        msg['To'] = admin_email
        msg['Subject'] = f"SnowBot Escalation — {user_name}"

        body = f"""
        <h2>User needs assistance</h2>
        <p><strong>Name:</strong> {user_name}</p>
        <p><strong>Email:</strong> {user_email}</p>
        <p><strong>Problem:</strong> {problem}</p>
        <p>Please contact this user as soon as possible.</p>
        """

        msg.attach(MIMEText(body, 'html'))

        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.starttls()
            server.login(smtp_email, smtp_password)
            server.sendmail(smtp_email, admin_email, msg.as_string())

        return True
    except Exception as e:
        print(f"Email error: {e}")
        return False

@router.post("")
async def chat(body: ChatRequest):

    if body.image:
        last_message = body.messages[-1].content if body.messages else "Analyze this image"
        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT_VISION},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": last_message},
                        {"type": "image_url", "image_url": {"url": body.image}}
                    ]
                }
            ],
            max_tokens=1024,
            temperature=0.7,
        )
        return {"response": response.choices[0].message.content}

    if body.role == "admin":
        system = SYSTEM_PROMPT_ADMIN
    else:
        system = SYSTEM_PROMPT_USER

    messages = [{"role": "system", "content": system}]
    for msg in body.messages:
        content = msg.content if isinstance(msg.content, str) else str(msg.content)
        messages.append({"role": msg.role, "content": content})

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        max_tokens=1024,
        temperature=0.7,
    )

    reply = response.choices[0].message.content

    if "ESCALATE_TO_ADMIN" in reply:
        last_user_msg = ""
        for msg in reversed(body.messages):
            if msg.role == "user":
                last_user_msg = msg.content
                break

        send_escalation_email(
            user_name=body.user_name or "Unknown User",
            user_email=body.user_email or "unknown@email.com",
            problem=last_user_msg
        )

        clean_reply = reply.replace("ESCALATE_TO_ADMIN", "").strip()
        if not clean_reply:
            clean_reply = "I'm unable to resolve this issue. I've notified the administrator and they will contact you shortly."

        return {"response": clean_reply, "escalated": True}

    return {"response": reply, "escalated": False}