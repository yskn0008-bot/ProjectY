#!/usr/bin/env python3
from pathlib import Path

SOURCE = Path(__file__).with_name('YOS Screenshot Router.cherri').read_text(encoding='utf-8')


def require(fragment: str) -> None:
    assert fragment in SOURCE, f'missing required contract: {fragment}'


def forbid(fragment: str) -> None:
    assert fragment not in SOURCE, f'forbidden in screenshot-router v1: {fragment}'


def main() -> None:
    require('takeScreenshot()')
    require('extractImageText(screenshot)')
    require('askChatGPT(modelPrompt, false, "Dictionary")')
    require('YOS Screenshots/Inbox/{stamp}.png')
    require('YOS Screenshots/{@folder}/{stamp}.png')
    require('reference, shopping, schedule, idea, work, other')
    require('@folder = "資料"')
    require('@folder = "買い物"')
    require('@folder = "予定"')
    require('@folder = "Idea"')
    require('@folder = "仕事"')
    require('@folder = "未分類"')
    require('appendToFile("YOS Screenshots/index.tsv"')

    raw_first = SOURCE.index('YOS Screenshots/Inbox/{stamp}.png')
    model_call = SOURCE.index('askChatGPT(modelPrompt')
    assert raw_first < model_call, 'raw screenshot must be persisted before model classification'

    # v1 only classifies and files screenshots. External state changes stay fail-closed.
    for external_write in (
        'addEvent(',
        'addReminder(',
        'sendMessage(',
        'sendEmail(',
        'deletePhotos(',
        'deleteFiles(',
        'httpRequest(',
    ):
        forbid(external_write)

    print('OK: screenshot-router v1 source contracts pass')


if __name__ == '__main__':
    main()
