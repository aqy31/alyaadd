text = open('hand_tracker.js').read()
index = 28256
line_no = text[:index].count('\n') + 1
print(f"Index {index} is around line {line_no}")
