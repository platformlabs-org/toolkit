// JsonWriter.hpp - Minimal zero-dependency JSON/CSV writer.
//
// We deliberately avoid pulling in a JSON library: output is a flat object
// per run, one per line (JSONL) or a single CSV row. Strings are escaped
// for JSON safety.
#pragma once
#include <cstdio>
#include <cstdint>
#include <string>
#include <sstream>
#include <vector>

namespace st {

inline void json_escape(std::string& out, const char* s) {
    if (!s) { out += "\"\""; return; }
    out += '"';
    for (const char* p = s; *p; ++p) {
        unsigned char c = static_cast<unsigned char>(*p);
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out += static_cast<char>(c);
                }
        }
    }
    out += '"';
}

// A small JSON builder producing a single-line object. Commas are emitted
// *before* each field except the first, which avoids any trailing-comma
// issue and requires no post-processing of the buffer.
class JsonObject {
public:
    JsonObject& add(const char* key, long long v)        { return emit(key, std::to_string(v)); }
    JsonObject& add(const char* key, double v)           { return emit(key, std::to_string(v)); }
    JsonObject& add(const char* key, int v)              { return emit(key, std::to_string(v)); }
    JsonObject& add(const char* key, unsigned int v)     { return emit(key, std::to_string(v)); }
    JsonObject& add(const char* key, unsigned long v)    { return emit(key, std::to_string(v)); }
    JsonObject& add(const char* key, bool v)             { return emit(key, v ? "true" : "false"); }
    JsonObject& add(const char* key, const char* v) {
        std::string s;
        json_escape(s, v ? v : "");
        return emit(key, s);
    }
    JsonObject& add(const char* key, const std::string& v) { return add(key, v.c_str()); }

    void clear() { buf_.clear(); first_ = true; }

    std::string str() const {
        return "{" + buf_ + "}";
    }

private:
    // Emits a leading comma when not the first field, then "key":value.
    template <typename T>
    JsonObject& emit(const char* key, const T& value) {
        if (!first_) buf_ += ",";
        first_ = false;
        buf_ += '"';
        buf_ += key;
        buf_ += "\":";
        buf_ += value;  // value is already a std::string here
        return *this;
    }

    std::string buf_;
    bool first_ = true;
};

} // namespace st
