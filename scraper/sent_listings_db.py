"""Sent listings tracker — prevents duplicate listings in emails."""
import json, os
from datetime import datetime, timedelta

DB_FILE = os.path.join(os.path.dirname(__file__), 'data', 'sent_listings.json')

def load_db():
    if os.path.exists(DB_FILE):
        try: return json.load(open(DB_FILE))
        except: pass
    return {'sent': {}}

def save_db(db):
    os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
    json.dump(db, open(DB_FILE, 'w'), indent=2)

def mark_sent(listing_ids):
    db = load_db()
    now = datetime.utcnow().isoformat()
    for lid in listing_ids: db['sent'][lid] = now
    save_db(db)

def get_sent_ids(age_limit_days=30):
    cutoff = (datetime.utcnow() - timedelta(days=age_limit_days)).isoformat()
    return {lid for lid, ts in load_db()['sent'].items() if ts >= cutoff}

def filter_already_sent(listings):
    sent = get_sent_ids()
    filtered, skipped = [], []
    for listing in listings:
        lid = listing.get('listing_id') or listing.get('id')
        (skipped if lid in sent else filtered).append(listing)
    return filtered, skipped
