import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.db.models.conversation import ConversationStatus
from app.db.session import get_db
from app.schemas.conversation import (
    ConversationCreate,
    ConversationListResponse,
    ConversationMessagePayload,
    ConversationRead,
    ConversationUpdate,
)
from app.services.conversations import (
    append_conversation_message,
    create_conversation,
    get_conversation,
    list_conversations,
    read_conversation,
    update_conversation,
)

router = APIRouter(tags=["conversations"])


@router.get(
    "/conversations",
    response_model=ConversationListResponse,
    summary="List Conversations",
)
def list_conversation_history(db: Session = Depends(get_db)) -> ConversationListResponse:
    return ConversationListResponse(items=list_conversations(db))


@router.post(
    "/conversations",
    response_model=ConversationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create Conversation",
)
def create_conversation_history(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
) -> ConversationRead:
    conversation = create_conversation(
        db,
        title=payload.title,
        active_document_ids=payload.active_document_ids,
    )
    return read_conversation(conversation)


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationRead,
    summary="Get Conversation",
)
def get_conversation_history(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> ConversationRead:
    conversation = get_conversation(db, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="conversation not found")
    return read_conversation(conversation)


@router.patch(
    "/conversations/{conversation_id}",
    response_model=ConversationRead,
    summary="Update Conversation",
)
def patch_conversation_history(
    conversation_id: uuid.UUID,
    payload: ConversationUpdate,
    db: Session = Depends(get_db),
) -> ConversationRead:
    conversation = get_conversation(db, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="conversation not found")

    conversation = update_conversation(
        db,
        conversation,
        title=payload.title,
        status=payload.status,
        active_document_ids=payload.active_document_ids,
    )
    return read_conversation(conversation)


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Conversation",
)
def delete_conversation_history(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Response:
    conversation = get_conversation(db, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="conversation not found")
    update_conversation(db, conversation, status=ConversationStatus.DELETED)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/conversations/{conversation_id}/messages",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Append Conversation Message",
)
def append_message_to_conversation(
    conversation_id: uuid.UUID,
    payload: ConversationMessagePayload,
    db: Session = Depends(get_db),
) -> Response:
    conversation = get_conversation(db, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="conversation not found")
    append_conversation_message(db, conversation, payload)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

