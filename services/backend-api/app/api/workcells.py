from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Workcell

router = APIRouter()


@router.get("")
def list_workcells(db: Session = Depends(get_db)):
    return db.query(Workcell).all()
