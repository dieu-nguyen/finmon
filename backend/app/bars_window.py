from datetime import date, timedelta


def resolve_window(from_: date | None, to: date | None) -> tuple[date, date]:
    if to is None:
        to = date.today()
    if from_ is None:
        from_ = to - timedelta(days=365)
    return from_, to
