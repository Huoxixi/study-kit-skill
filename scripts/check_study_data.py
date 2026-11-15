"""Check study-data links and coverage, not subject-matter correctness. Python stdlib only."""
import argparse
import json
import sys
from pathlib import Path


def validate(data, mode="full"):
    errors, warnings = [], []

    def error(where, message):
        errors.append({"at": where, "message": message})

    def text(row, key, where):
        value = row.get(key)
        if not isinstance(value, str) or not value.strip():
            error(where, key + " must be a nonempty string")
            return ""
        return value

    def enum(row, key, allowed, where):
        value = text(row, key, where)
        if value and value not in allowed:
            error(where, key + " must be one of " + ", ".join(sorted(allowed)))
        return value

    def rows(key, required=True):
        value = data.get(key, [])
        if not isinstance(value, list):
            error(key, "must be an array")
            return {}
        if required and not value:
            error(key, "must not be empty")
        result = {}
        for i, row in enumerate(value):
            where = f"{key}[{i}]"
            if not isinstance(row, dict):
                error(where, "must be an object")
                continue
            ident = text(row, "id", where)
            if not ident:
                continue
            if ident in result:
                error(where, "duplicate id: " + ident)
            else:
                result[ident] = row
        return result

    def refs(row, field, targets, where, required=True):
        value = row.get(field, [])
        if not isinstance(value, list):
            error(where, field + " must be an array")
            return []
        if required and not value:
            error(where, field + " must not be empty")
        valid = []
        for item in value:
            if not isinstance(item, str) or item not in targets:
                error(where, field + " has an unknown or invalid id: " + repr(item))
            elif item in valid:
                error(where, field + " repeats " + item)
            else:
                valid.append(item)
        return valid

    def citations(row, field, where, required=False):
        value = row.get(field, [])
        if not isinstance(value, list):
            error(where, field + " must be an array")
            return
        if required and not value:
            error(where, field + " must not be empty")
        for i, item in enumerate(value):
            loc = f"{where}.{field}[{i}]"
            if not isinstance(item, dict):
                error(loc, "citation must be an object")
                continue
            source = text(item, "sourceId", loc)
            if source and source not in sources:
                error(loc, "unknown source: " + source)
            text(item, "location", loc)

    if not isinstance(data, dict):
        return {"status": "fail", "errors": [{"at": "root", "message": "must be an object"}], "warnings": [], "counts": {}, "coverage": []}
    course = data.get("course")
    if not isinstance(course, dict):
        error("course", "must be an object")
    else:
        text(course, "id", "course")
        text(course, "title", "course")
    sources = rows("sources")
    objectives = rows("objectives")
    cards = rows("cards")
    questions = rows("questions", required=mode == "full")
    coverage = {ident: {"objectiveId": ident, "cardIds": [], "questionIds": []} for ident in objectives}
    card_objectives = {}
    for ident, row in sources.items():
        text(row, "title", "source/" + ident)
        text(row, "locator", "source/" + ident)
    for ident, row in objectives.items():
        where = "objective/" + ident
        text(row, "title", where)
        citations(row, "sourceRefs", where, required=True)
        if not isinstance(row.get("practiceRequired", True), bool):
            error(where, "practiceRequired must be boolean")
        if row.get("practiceRequired") is False:
            text(row, "practiceNote", where)
    for ident, row in cards.items():
        where = "card/" + ident
        for field in ("title", "concept", "example", "pitfall"):
            text(row, field, where)
        enum(row, "definitionStatus", {"source-based", "scope-only", "interpretation"}, where)
        citations(row, "sourceRefs", where, required=True)
        linked = refs(row, "objectiveIds", objectives, where)
        card_objectives[ident] = linked
        for objective in linked:
            coverage[objective]["cardIds"].append(ident)
    choice_types = {"single", "multi", "boolean"}
    for ident, row in questions.items():
        where = "question/" + ident
        for field in ("stem", "explanation"):
            text(row, field, where)
        kind = enum(row, "type", choice_types | {"short", "calculation", "case", "code"}, where)
        origin = enum(row, "provenance", {"official", "instructor", "authored", "adapted"}, where)
        grading = enum(row, "grading", {"exact", "rubric", "reference"}, where)
        status = enum(row, "reviewStatus", {"verified", "provisional", "disputed"}, where)
        citations(row, "sourceRefs", where, required=origin != "authored")
        citations(row, "explanationSourceRefs", where)
        linked = refs(row, "cardIds", cards, where)
        for objective in {o for card in linked for o in card_objectives.get(card, [])}:
            coverage[objective]["questionIds"].append(ident)
        if grading == "exact" and (status != "verified" or kind not in choice_types):
            error(where, "exact grading requires a verified choice/boolean question")
        if status == "disputed":
            text(row, "caution", where)
        if kind in choice_types:
            options = row.get("options")
            option_ids = {}
            if not isinstance(options, list) or len(options) < 2:
                error(where, "options must contain at least two choices")
            else:
                for i, option in enumerate(options):
                    loc = f"{where}.options[{i}]"
                    if not isinstance(option, dict):
                        error(loc, "must be an object")
                        continue
                    oid = text(option, "id", loc)
                    text(option, "text", loc)
                    if oid in option_ids:
                        error(loc, "duplicate option id")
                    if oid:
                        option_ids[oid] = option
            answer = refs(row, "answer", option_ids, where)
            if kind in {"single", "boolean"} and len(answer) != 1:
                error(where, "single/boolean question requires exactly one answer")
            if kind == "boolean" and set(option_ids) != {"T", "F"}:
                error(where, "boolean options must be T and F")
        if grading in {"rubric", "reference"}:
            text(row, "referenceAnswer", where)
        if grading == "rubric":
            rubric = row.get("rubric")
            if not isinstance(rubric, list) or not rubric or any(not isinstance(x, str) or not x.strip() for x in rubric):
                error(where, "rubric must contain nonempty checklist items")
    for ident, item in coverage.items():
        if not item["cardIds"]:
            error("objective/" + ident, "has no knowledge card")
        if mode == "full" and objectives[ident].get("practiceRequired", True) is not False and not item["questionIds"]:
            error("objective/" + ident, "has no linked practice question")
        if objectives[ident].get("practiceRequired") is False:
            warnings.append({"at": "objective/" + ident, "message": "practice coverage explicitly waived; inspect practiceNote"})
    return {"status": "fail" if errors else "pass", "scope": "structure and links only; not semantic verification", "mode": mode,
            "counts": {"sources": len(sources), "objectives": len(objectives), "cards": len(cards), "questions": len(questions)},
            "errors": errors, "warnings": warnings, "coverage": list(coverage.values())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--mode", choices=("full", "cards"), default="full")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    try:
        data = json.loads(args.input.read_text(encoding="utf-8-sig"))
        report = validate(data, args.mode)
        output = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        if args.report:
            if args.report.resolve() == args.input.resolve():
                raise ValueError("report path must not overwrite input")
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(output, encoding="utf-8")
        print(json.dumps({"status": report["status"], "errors": len(report["errors"]), "warnings": len(report["warnings"]), "counts": report["counts"]}))
        return 1 if report["errors"] else 0
    except (OSError, ValueError) as exc:
        print("Input/output error: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
