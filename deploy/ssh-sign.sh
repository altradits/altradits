#!/bin/sh
# Wrapper so git can use the Node signer as gpg.ssh.program.
exec node "$(dirname "$0")/ssh-sign.mjs" "$@"
