// Version.hpp - single source of truth for the AppTrace version.
//
// Consumed by main.cpp (--version / banner) and AppTrace.rc (the VERSIONINFO
// resource shown in Explorer's Properties -> Details). Bump together with
// user-visible behavior/output changes.
#pragma once

#define APPTRACE_VERSION_MAJOR 1
#define APPTRACE_VERSION_MINOR 1
#define APPTRACE_VERSION_PATCH 0
#define APPTRACE_VERSION_STRING "1.1.0"

// Comma form for VERSIONINFO's FILEVERSION/PRODUCTVERSION fields (the rc
// preprocessor expands this to 1,1,0,0).
#define APPTRACE_RC_VERSION \
    APPTRACE_VERSION_MAJOR, APPTRACE_VERSION_MINOR, APPTRACE_VERSION_PATCH, 0
