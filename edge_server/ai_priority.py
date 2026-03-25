from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
import re

analyzer = SentimentIntensityAnalyzer()

def get_message_priority(text: str) -> int:
    """
    Returns priority 1 (lowest) to 10 (highest).
    Rules:
    - High priority for emergency keywords
    - Sentiment analysis (negative sentiment often implies distress/urgency in DTN)
    - Default priority is 3.
    """
    priority = 3
    
    # Keyword heuristics
    high_urgency = ["emergency", "help", "sos", "urgent", "danger", "critical", "need", "injured", "medical", "fire", "police", "ambulance", "water", "food", "blood"]
    medium_urgency = ["warning", "caution", "alert", "attention", "important"]
    
    text_lower = text.lower()
    
    # Check for keywords
    if any(re.search(r'\b' + word + r'\b', text_lower) for word in high_urgency):
        priority = max(priority, 8)
    elif any(re.search(r'\b' + word + r'\b', text_lower) for word in medium_urgency):
        priority = max(priority, 5)
        
    # Sentiment analysis
    sentiment = analyzer.polarity_scores(text)
    # If strongly negative, it might be an emergency or distress. Increase priority.
    if sentiment['compound'] < -0.5:
        priority = min(10, priority + 2)
    
    if priority >= 8 and sentiment['compound'] < -0.8:
        priority = 10
        
    return priority
