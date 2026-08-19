// Utf8.hpp - Output-encoding + small string helpers.
//
// Encoding: all human-visible output (target labels, JSON/CSV lines,
// diagnostics that embed user paths) is emitted as UTF-8 so files and consoles
// render the same regardless of the caller's codepage. Internal correlation
// keys (process names from ETW, name_key) stay in the active codepage - they
// are compared against each other, never displayed raw.
//
// String helpers: the codebase repeatedly needs narrow->wide conversion
// (launch paths), ASCII lowercasing (name keys), and basename extraction
// (image paths) - those live here so every module shares one implementation.
#pragma once
#include <windows.h>
#include <string>
#include <cctype>

namespace st {

// Narrow string in the active codepage (CP_ACP) -> UTF-8.
inline std::string to_utf8(const char* s) {
    if (!s || !s[0]) return {};
    int wlen = MultiByteToWideChar(CP_ACP, 0, s, -1, nullptr, 0);
    if (wlen <= 0) return {};
    std::wstring w(size_t(wlen), 0);
    MultiByteToWideChar(CP_ACP, 0, s, -1, &w[0], wlen);
    int ulen = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, nullptr, 0,
                                   nullptr, nullptr);
    if (ulen <= 0) return {};
    std::string u(size_t(ulen), 0);
    WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, &u[0], ulen,
                        nullptr, nullptr);
    u.resize(size_t(ulen) - 1);  // drop the NUL the size query counted
    return u;
}

inline std::string to_utf8(const std::string& s) { return to_utf8(s.c_str()); }

// Narrow (active codepage) -> wide. The one conversion every launcher path
// needs; previously duplicated as a local lambda in three call sites.
inline std::wstring to_wide(const std::string& s) {
    if (s.empty()) return {};
    int n = MultiByteToWideChar(CP_ACP, 0, s.c_str(), (int)s.size(), nullptr, 0);
    std::wstring w(size_t(n), 0);
    MultiByteToWideChar(CP_ACP, 0, s.c_str(), (int)s.size(), &w[0], n);
    return w;
}

// Lowercase ASCII letters in place (name keys are compared byte-wise; the
// process-name pipeline is ASCII even when app names carry CJK, because the
// comparison target always comes from the same QueryFullProcessImageName
// source with identical casing rules).
inline void to_lower_ascii(std::string& s) {
    for (char& c : s) c = (char)tolower((unsigned char)c);
}

inline std::string lowered(std::string s) {
    to_lower_ascii(s);
    return s;
}

// Basename of a path (keeps the extension - process-name correlation uses
// "app.exe", not "app").
inline std::string basename_of(const std::string& path) {
    size_t slash = path.find_last_of("\\/");
    return (slash == std::string::npos) ? path : path.substr(slash + 1);
}

} // namespace st
