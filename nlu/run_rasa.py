"""Rasa entrypoint with a Windows tar extraction path compatibility fix.

Rasa 3.6 adds an extended-length prefix, but recent Python 3.10 tarfile
uses mixed separators for member directory metadata. Normal Windows paths
handle these separators. TarSafe's original traversal checks remain enabled.
"""
import os

if os.name == "nt":
    from tarsafe import TarSafe

    _extractall = TarSafe.extractall

    def extractall_windows(self, path=".", members=None, numeric_owner=False):
        path = os.fspath(path)
        if path.startswith("\\\\?\\") and not path.startswith("\\\\?\\UNC\\"):
            path = path[4:]
        return _extractall(self, os.path.normpath(path), members, numeric_owner)

    TarSafe.extractall = extractall_windows

if __name__ == "__main__":
    from rasa.__main__ import main
    main()
