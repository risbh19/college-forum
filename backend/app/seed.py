"""Idempotent fictional content for the explicitly enabled local demo only."""
from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from .config import Settings, sqlalchemy_url
from .models import Comment, Post, User, Vote, VoteType, utcnow


def seed():
    settings = Settings()
    if not settings.college_forum_local:
        raise RuntimeError("Sample data is available only in the dedicated local demo")
    engine = create_engine(sqlalchemy_url(settings.database_url.get_secret_value()), hide_parameters=True)
    with Session(engine) as db, db.begin():
        for ident, name in (("1" * 32, "shadowcoder42"), ("2" * 32, "campusowl")):
            if db.get(User, ident) is None:
                db.add(User(id=ident, username=name, username_lower=name.lower()))
        db.flush()
        samples = [
            ("local-welcome", "general", "Welcome to your campus common room 👋", "This is your local College Forum. Start a discussion, try the boards, and make this space your own.\n\nThese welcome posts are fictional sample content. New posts, votes, and comments are saved in this project folder."),
            ("local-study", "cse", "Anyone up for a weekend coding study group?", "DSA, side projects, and finally understanding that one lecture. What would you want to work on?\n\nA sample discussion for exploring this board."),
            ("local-hostel", "hostel", "What makes a hostel room feel like home?", "A desk lamp, a good playlist, and a reliable snack stash are my top three. Add your small upgrades below.\n\nFictional sample content."),
            ("local-placements", "placements", "A place to share interview prep resources", "Practice questions, resume tips, and lessons from mock interviews. What helped you most?\n\nSample content; these are not real job listings."),
            ("local-confessions", "confessions", "Small confession: I still get lost on campus", "Every building looks familiar until I need to find a classroom. Please tell me this is a universal experience.\n\nA fictional local sample."),
            ("local-general", "general", "What do you wish you knew in your first semester?", "Ask the question, even if it feels obvious. Someone else is probably wondering the same thing.\n\nShare a tip in this sample discussion."),
        ]
        for index, (ident, board, title, body) in enumerate(samples):
            if db.get(Post, ident) is None:
                db.add(Post(id=ident, title=title, body=body, board=board, user_id=("1" if index % 2 == 0 else "2") * 32, created_at=utcnow() - timedelta(hours=index)))
        db.flush()
        if db.get(Comment, "local-welcome-comment") is None:
            db.add(Comment(id="local-welcome-comment", body="Try switching local accounts. Only the author can delete a post.", post_id="local-welcome", user_id="2" * 32))
        if db.get(Vote, ("2" * 32, "local-welcome")) is None:
            db.add(Vote(user_id="2" * 32, post_id="local-welcome", type=VoteType.UP))
    engine.dispose()


if __name__ == "__main__":
    seed()
