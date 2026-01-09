package cli

import "strings"

type ArgSet struct {
	values map[string][]string
	flags  map[string]bool
}

func ParseArgs(argv []string) *ArgSet {
	m := &ArgSet{
		values: map[string][]string{},
		flags:  map[string]bool{},
	}

	isFlag := func(a string) bool {
		switch a {
		case "--select-all", "--dry-run", "--schedule-go-live",
			"--auto-install-os-upgrade", "--no-auto-install-os-upgrade",
			"--auto-install-applicable", "--no-auto-install-applicable",
			"--is-disclosure-restricted", "--publish-to-windows10s",
			"--is-reboot-required", "--is-co-engineered",
			"--is-for-unreleased-hardware", "--has-ui-software",
			"--no-ui", "--no-filter":
			return true
		default:
			return false
		}
	}

	addValue := func(k, v string) { m.values[k] = append(m.values[k], v) }
	addFlag := func(k string) { m.flags[k] = true }

	for i := 0; i < len(argv); i++ {
		a := argv[i]
		if !strings.HasPrefix(a, "--") {
			continue
		}
		if isFlag(a) {
			addFlag(a)
			continue
		}
		if i+1 >= len(argv) || strings.HasPrefix(argv[i+1], "--") {
			addValue(a, "")
			continue
		}

		if a == "--visible-to-accounts" || a == "--affected-oems" || a == "--chids" {
			for i+1 < len(argv) && !strings.HasPrefix(argv[i+1], "--") {
				i++
				addValue(a, argv[i])
			}
		} else {
			i++
			addValue(a, argv[i])
		}
	}

	return m
}

func (m *ArgSet) HasFlag(key string) bool { return m.flags[key] }

func (m *ArgSet) GetSingle(key string) string {
	if v := m.values[key]; len(v) > 0 {
		return v[0]
	}
	return ""
}

func (m *ArgSet) GetMany(key string) []string {
	if v := m.values[key]; len(v) > 0 {
		return v
	}
	return []string{}
}
