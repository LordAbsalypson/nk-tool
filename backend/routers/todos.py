from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Todo
from schemas import ApiResponse, TodoCreate, TodoOut, TodoUpdate

router = APIRouter(tags=["todos"])


@router.get("/todos")
def list_todos(db: Session = Depends(get_db)) -> ApiResponse:
    items = db.query(Todo).order_by(Todo.erstellt_am.asc()).all()
    return ApiResponse(ok=True, data=[TodoOut.model_validate(i) for i in items])


@router.post("/todos", status_code=201)
def create_todo(body: TodoCreate, db: Session = Depends(get_db)) -> ApiResponse:
    obj = Todo(text=body.text, erledigt=False)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return ApiResponse(ok=True, data=TodoOut.model_validate(obj))


@router.put("/todos/{todo_id}")
def update_todo(todo_id: int, body: TodoUpdate, db: Session = Depends(get_db)) -> ApiResponse:
    obj = db.get(Todo, todo_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Todo nicht gefunden")
    if body.text is not None:
        obj.text = body.text
    if body.erledigt is not None:
        obj.erledigt = body.erledigt
        obj.erledigt_am = datetime.utcnow().isoformat() if body.erledigt else None
    db.commit()
    db.refresh(obj)
    return ApiResponse(ok=True, data=TodoOut.model_validate(obj))


@router.delete("/todos/{todo_id}")
def delete_todo(todo_id: int, db: Session = Depends(get_db)) -> ApiResponse:
    obj = db.get(Todo, todo_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Todo nicht gefunden")
    db.delete(obj)
    db.commit()
    return ApiResponse(ok=True, data=None)
