def format_date(date_string):
    """Format a date string to a more readable format."""
    from datetime import datetime
    return datetime.strptime(date_string, '%Y-%m-%d').strftime('%B %d, %Y')

def log_message(message):
    """Log a message to the console."""
    print(f"[LOG] {message}")