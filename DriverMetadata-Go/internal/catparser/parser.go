package catparser

import (
	"fmt"
	"syscall"
	"unicode/utf16"
	"unsafe"
)

var (
	modCrypt32           = syscall.NewLazyDLL("crypt32.dll")
	procCryptQueryObject = modCrypt32.NewProc("CryptQueryObject")
	procCertFreeCTLContext = modCrypt32.NewProc("CertFreeCTLContext")
)

type MetadataEntry struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

func ExtractMetadata(filePath string) ([]MetadataEntry, error) {
	pathPtr, err := syscall.UTF16PtrFromString(filePath)
	if err != nil {
		return nil, err
	}

	var dwEncoding, dwContentType, dwFormatType uint32
	var hCertStore, hMsg, pCtlContext uintptr

	// CryptQueryObject(CERT_QUERY_OBJECT_FILE, filePath, 0x3FFF, 0xE, 0, ...)
	// 0x3FFF = CERT_QUERY_CONTENT_FLAG_ALL
	// 0xE = CERT_QUERY_FORMAT_FLAG_ALL
	ret, _, errLast := procCryptQueryObject.Call(
		uintptr(CERT_QUERY_OBJECT_FILE),
		uintptr(unsafe.Pointer(pathPtr)),
		uintptr(0x3FFF),
		uintptr(0xE),
		0,
		uintptr(unsafe.Pointer(&dwEncoding)),
		uintptr(unsafe.Pointer(&dwContentType)),
		uintptr(unsafe.Pointer(&dwFormatType)),
		uintptr(unsafe.Pointer(&hCertStore)),
		uintptr(unsafe.Pointer(&hMsg)),
		uintptr(unsafe.Pointer(&pCtlContext)),
	)

	if ret == 0 {
		return nil, fmt.Errorf("CryptQueryObject failed: %v", errLast)
	}
	defer procCertFreeCTLContext.Call(pCtlContext)

	// Convert pCtlContext to Go struct
	ctlContext := (*CTL_CONTEXT)(unsafe.Pointer(pCtlContext))
	if ctlContext.PCtlInfo == nil {
		return nil, fmt.Errorf("PCtlInfo is nil")
	}

	ctlInfo := ctlContext.PCtlInfo

	var results []MetadataEntry

	// Iterate extensions
	extCount := int(ctlInfo.CExtension)
	if extCount == 0 || ctlInfo.RgExtension == 0 {
		return results, nil
	}

	extSize := unsafe.Sizeof(CERT_EXTENSION{})

	for i := 0; i < extCount; i++ {
		extPtr := ctlInfo.RgExtension + uintptr(i)*extSize
		ext := (*CERT_EXTENSION)(unsafe.Pointer(extPtr))

		oid := ptrToString(ext.PszObjId)
		if oid == "1.3.6.1.4.1.311.12.2.1" {
			key, val, ok := parseAttr(ext.Value)
			if ok {
				results = append(results, MetadataEntry{Key: key, Value: val})
			}
		}
	}

	return results, nil
}

func ptrToString(p *byte) string {
	if p == nil {
		return ""
	}
	// Find null terminator
	var length int
	for {
		if *(*byte)(unsafe.Pointer(uintptr(unsafe.Pointer(p)) + uintptr(length))) == 0 {
			break
		}
		length++
	}
	return string(unsafe.Slice(p, length))
}

func parseAttr(blob CRYPT_DATA_BLOB) (string, string, bool) {
	if blob.CbData == 0 || blob.PbData == 0 {
		return "", "", false
	}

	data := unsafe.Slice((*byte)(unsafe.Pointer(blob.PbData)), blob.CbData)

	p := 0
	if p >= len(data) { return "", "", false }

	if data[p] != 0x30 { // Sequence
		return "", "", false
	}
	p++

	// Skip length
	_, n := getLen(data, p)
	p += n

	if p >= len(data) || data[p] != 0x1E { // BMPString (Label) ? C# says 0x1E is BMPString
		return "", "", false
	}
	p++

	lLen, h1 := getLen(data, p)
	p += h1

	if p+lLen > len(data) { return "", "", false }

	// Decode BMPString (BigEndian Unicode) to String
	labelBytes := data[p : p+lLen]
	label := decodeBigEndianUnicode(labelBytes)
	p += lLen

	// Skip potential INTEGER (0x02)
	if p < len(data) && data[p] == 0x02 {
		p++
		if p >= len(data) { return "", "", false }
		iLen, h2 := getLen(data, p)
		p += h2 + iLen
	}

	// Octet String (0x04) -> Value
	if p < len(data) && data[p] == 0x04 {
		p++
		vLen, h3 := getLen(data, p)
		p += h3

		if p+vLen > len(data) { return "", "", false }

		valBytes := data[p : p+vLen]
		val := decodeLittleEndianUnicode(valBytes)

		return label, val, true
	}

	return "", "", false
}

// C#: GetLen logic
// byte b = d[p]; if (b <= 0x7F) { h=1; return b; }
// int n = b & 0x7F; ...
func getLen(d []byte, p int) (int, int) {
	if p >= len(d) { return 0, 0 }
	b := d[p]
	if b <= 0x7F {
		return int(b), 1
	}

	n := int(b & 0x7F)
	if p+1+n > len(d) { return 0, 0 } // Safety

	l := 0
	for i := 1; i <= n; i++ {
		l = (l << 8) | int(d[p+i])
	}
	return l, 1 + n
}

func decodeBigEndianUnicode(b []byte) string {
	// Java/C# "Unicode" usually means UTF-16. C# Encoding.BigEndianUnicode
	if len(b)%2 != 0 { return "" }
	u16s := make([]uint16, len(b)/2)
	for i := 0; i < len(u16s); i++ {
		u16s[i] = uint16(b[i*2])<<8 | uint16(b[i*2+1])
	}
	return string(utf16.Decode(u16s))
}

func decodeLittleEndianUnicode(b []byte) string {
	// C# Encoding.Unicode (Little Endian)
	if len(b)%2 != 0 { return "" }
	u16s := make([]uint16, len(b)/2)
	for i := 0; i < len(u16s); i++ {
		u16s[i] = uint16(b[i*2+1])<<8 | uint16(b[i*2])
	}
	return string(utf16.Decode(u16s))
}
