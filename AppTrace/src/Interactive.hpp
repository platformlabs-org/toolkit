// Interactive.hpp - line parsing for the interactive (double-click) mode.
//
// The interactive prompt accepts the same grammar as the command line:
//     [options] <target> [args...]
// Targets may be pasted with or without surrounding quotes, and unquoted
// paths containing spaces are repaired by joining successive tokens until
// one names an existing file. File existence is injected as a predicate so
// the parsing logic stays unit-testable without touching the filesystem.
#pragma once
#include <functional>
#include <string>
#include <vector>

namespace st {

// Split a line into quote-aware tokens. Double or single quotes group a
// token and are stripped; a backslash is NOT an escape (Windows paths).
inline std::vector<std::string> tokenize_line(const std::string& s) {
    std::vector<std::string> toks;
    size_t i = 0;
    while (i < s.size()) {
        while (i < s.size() && (s[i] == ' ' || s[i] == '\t')) ++i;
        if (i >= s.size()) break;
        std::string tok;
        if (s[i] == '"' || s[i] == '\'') {
            char q = s[i++];
            while (i < s.size() && s[i] != q) tok += s[i++];
            if (i < s.size()) ++i;  // skip the closing quote
        } else {
            while (i < s.size() && s[i] != ' ' && s[i] != '\t') tok += s[i++];
        }
        toks.push_back(tok);
    }
    return toks;
}

// Repair an unquoted path containing spaces. `target` holds the first
// positional token and `args` the rest (as parse_args split them); while
// `exists(target)` is false, join the next arg onto the target. The first
// join that names an existing file becomes the target (those args are
// consumed); when nothing matches, both are left untouched. Returns the
// number of args consumed.
inline size_t join_spaced_target(
    std::string& target, std::vector<std::string>& args,
    const std::function<bool(const std::string&)>& exists) {
    if (exists(target) || args.empty()) return 0;
    std::string acc = target;
    for (size_t k = 0; k < args.size(); ++k) {
        acc += ' ';
        acc += args[k];
        if (exists(acc)) {
            target = acc;
            args.erase(args.begin(), args.begin() + (k + 1));
            return k + 1;
        }
    }
    return 0;
}

} // namespace st
