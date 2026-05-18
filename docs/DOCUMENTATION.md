# Set Path Without Sudo Rights
1. Create a local Go folder
```bash
mkdir -p ~/go
```
2. Append the new paths to your new shell profiles
```bash
echo 'export GOPATH=$HOME/go' >> ~/bashrc
echo 'export GOMODCACHE=$HOME/go/pkg/mod' >> ~/.bashrc
echo 'export PATH=$PATH:$GOPATH/bin' >> ~/.bashrc
```
3. Apply the changes to your current session
```bash
source ~/.bashrc
```
4. Verify the changes
```bash
go env GOPATH GOMODCACHE

```

##### Expecte Output
```bash
go: downloading go1.25.0 (linux/amd64)
/home/sthuita/go
/home/sthuita/go/pkg/mod
```

5. Initialize the project
```
go mod init altradits
```
