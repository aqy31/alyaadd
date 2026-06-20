text = open('hand_tracker.js').read()
stack = []
pairs = {'}': '{', ')': '(', ']': '['}
for i, char in enumerate(text):
    if char in '{[(':
        stack.append((char, i))
    elif char in '})]':
        if not stack:
            print(f"Unmatched closing {char} at index {i}")
            break
        last, last_i = stack.pop()
        if last != pairs[char]:
            print(f"Mismatched {char} at index {i}. Expected to close {last} from {last_i}")
            break
else:
    if stack:
        print(f"Unmatched opening {stack[-1][0]} at index {stack[-1][1]}")
    else:
        print("Balanced!")
