"""Preserve Korean spans and particles for DIET's trainable slot extraction.

Keep complete Korean words for character n-gram features and retain exact spans.
No query keywords live here.
"""
import re
from rasa.engine.recipes.default_recipe import DefaultV1Recipe
from rasa.nlu.tokenizers.whitespace_tokenizer import WhitespaceTokenizer
from rasa.nlu.tokenizers.tokenizer import Token


@DefaultV1Recipe.register(
    DefaultV1Recipe.ComponentType.MESSAGE_TOKENIZER, is_trainable=False
)
class KoreanTokenizer(WhitespaceTokenizer):
    def tokenize(self, message, attribute):
        text = message.get(attribute) or ""
        tokens = []
        for match in re.finditer(r"\d+|[A-Za-z_]+|[가-힣]+|[^\s]", text):
            word = match.group()
            suffix = re.fullmatch(r"(.{2,}?)(으로는|으로|에서|처럼|하고|이랑|은|는|을|를|도|과|와)", word)
            if suffix:
                tokens.append(Token(suffix.group(1), match.start()))
                tokens.append(Token(suffix.group(2), match.start()+len(suffix.group(1))))
            else:
                tokens.append(Token(word, match.start()))
        return tokens
