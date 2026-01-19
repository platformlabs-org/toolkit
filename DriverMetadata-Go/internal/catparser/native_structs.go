package catparser

import (
	"unsafe"
)

type CTL_CONTEXT struct {
	DwMsgAndCertEncodingType uint32
	PbCtlEncoded             *byte
	CbCtlEncoded             uint32
	PCtlInfo                 *CTL_INFO
	HCertStore               unsafe.Pointer
	HMsg                     unsafe.Pointer
	PbContext                unsafe.Pointer // Reserved
	CbContext                uint32         // Reserved
}

// In WinAPI, pointers are usually uintptr in Go syscalls, but usually *Struct for easy access
// We need to match the memory layout exactly.

// CTL_INFO
type CTL_INFO struct {
	DwVersion          uint32
	SubjectUsage       CRYPT_DATA_BLOB
	ListIdentifier     CRYPT_DATA_BLOB
	SequenceNumber     CRYPT_DATA_BLOB
	ThisUpdate         FILETIME
	NextUpdate         FILETIME
	SubjectAlgorithm   CRYPT_ALGORITHM_IDENTIFIER
	CEntry             uint32
	RgEntry            unsafe.Pointer // PCTL_ENTRY
	CExtension         uint32
	RgExtension        uintptr // *CERT_EXTENSION (We use uintptr to iterate)
}

type CERT_EXTENSION struct {
	PszObjId  *byte // LPSTR
	FCritical int32 // BOOL
	Value     CRYPT_DATA_BLOB
}

type CRYPT_DATA_BLOB struct {
	CbData uint32
	PbData uintptr // *byte
}

type CRYPT_ALGORITHM_IDENTIFIER struct {
	PszObjId   *byte // LPSTR
	Parameters CRYPT_DATA_BLOB
}

type FILETIME struct {
	DwLowDateTime  uint32
	DwHighDateTime uint32
}

const (
	CERT_QUERY_OBJECT_FILE                = 1
	CERT_QUERY_CONTENT_FLAG_CATALOG_FILE  = 16384 // 0x4000
	CERT_QUERY_FORMAT_FLAG_BINARY         = 2
	CERT_QUERY_FORMAT_FLAG_BASE64_ENCODED = 1
	CERT_QUERY_FORMAT_FLAG_ALL            = 14 // 0xE
)
