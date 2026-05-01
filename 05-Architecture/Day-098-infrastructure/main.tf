resource "aws_instance" "forge_server" {
  count         = 3
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.medium"

  tags = {
    Name = "Altradits-Forge-${count.index}"
  }
}