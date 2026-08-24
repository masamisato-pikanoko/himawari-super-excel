from datetime import datetime
from freezegun import freeze_time
from zoneinfo import ZoneInfo

TOKYO=ZoneInfo('Asia/Tokyo')

@freeze_time('2026-08-24 08:30:00+00:00')
def test_evening_time(): assert datetime.now(TOKYO).strftime('%Y-%m-%d %H:%M') == '2026-08-24 17:30'

@freeze_time('2026-08-24 23:00:00+00:00')
def test_morning_time(): assert datetime.now(TOKYO).strftime('%Y-%m-%d %H:%M') == '2026-08-25 08:00'
