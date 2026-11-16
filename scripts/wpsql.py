"""Minimal reader for the WP Migrate MySQL dump (database.sql).

Parses CREATE TABLE column lists and INSERT ... VALUES tuples for the tables
asked for, returning {table: [row dicts]}. Read-only; never connects anywhere.
"""
import re

BACKSLASH = chr(92)
ESCAPES = {"n": "\n", "r": "\r", "t": "\t", "0": "\0", "Z": "\x1a"}


def _parse_values(s):
    rows, i, n = [], 0, len(s)
    while i < n:
        while i < n and s[i] in " \n\r\t,":
            i += 1
        if i >= n or s[i] == ";":
            break
        if s[i] != "(":
            raise ValueError("unexpected token near: " + s[i:i + 60])
        i += 1
        row = []
        while True:
            while s[i] in " \n\r\t":
                i += 1
            if s[i] == "'":
                i += 1
                buf = []
                while True:
                    c = s[i]
                    if c == BACKSLASH:
                        nxt = s[i + 1]
                        buf.append(ESCAPES.get(nxt, nxt))
                        i += 2
                    elif c == "'":
                        if s[i + 1] == "'":
                            buf.append("'")
                            i += 2
                        else:
                            i += 1
                            break
                    else:
                        buf.append(c)
                        i += 1
                row.append("".join(buf))
            else:
                j = i
                while s[j] not in ",)":
                    j += 1
                token = s[i:j].strip()
                row.append(None if token == "NULL" else token)
                i = j
            while s[i] in " \n\r\t":
                i += 1
            if s[i] == ",":
                i += 1
                continue
            if s[i] == ")":
                i += 1
                break
        rows.append(row)
    return rows


def read_tables(path, wanted):
    data = open(path, encoding="utf-8", errors="replace").read()
    columns = {}
    for m in re.finditer(r"CREATE TABLE `(\w+)` \((.*?)\n\)", data, re.S):
        columns[m.group(1)] = [c.group(1) for c in re.finditer(r"^\s*`(\w+)`", m.group(2), re.M)]
    out = {t: [] for t in wanted}
    for m in re.finditer(r"^INSERT INTO `(\w+)` (?:\(([^)]*)\) )?VALUES\s*", data, re.M):
        table = m.group(1)
        if table not in out:
            continue
        cols = re.findall(r"`(\w+)`", m.group(2)) if m.group(2) else columns[table]
        end = data.find(";\n", m.end())
        out[table].extend(dict(zip(cols, row)) for row in _parse_values(data[m.end():end + 1]))
    return out
