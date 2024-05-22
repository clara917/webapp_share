packer {
  required_plugins {
    amazon = {
      source  = "github.com/hashicorp/amazon"
      version = ">= 1.0.0"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-2"
}

variable "source_ami" {
  type    = string
  default = "ami-0ddf7dfd13a83d8c8"
}

variable "ssh_username" {
  type    = string
  default = "admin"
}

variable "access_key" {
  type    = string
  default = "{{env `AWS_ACCESS_KEY_ID}}"
}
variable "secret_key" {
  type    = string
  default = "{{env `AWS_SECRET_ACCESS_KEY`}}"
}

variable "subnet_id" {
  type    = string
  default = "subnet-0d27375991b498334"
}

# https://www.packer.io/plugins/builders/amazon/ebs
source "amazon-ebs" "my-ami" {
  region          = "${var.aws_region}"
  ami_name        = "csye6225_${formatdate("YYYY_MM_DD_hh_mm_ss", timestamp())}"
  ami_description = "AMI for CSYE 6225"
  ami_regions = [
    "us-east-2",
  ]

  ami_users = ["834061939258"] #demo account

  aws_polling {
    delay_seconds = 120
    max_attempts  = 50
  }

  instance_type = "t2.micro"
  source_ami    = "${var.source_ami}"
  ssh_username  = "${var.ssh_username}"
  subnet_id     = "${var.subnet_id}"

  profile = "dev"

}


build {
  sources = ["source.amazon-ebs.my-ami"]

  provisioner "shell" {
    environment_vars = [
      "DEBIAN_FRONTEND=noninteractive",
      "CHECKPOINT_DISABLE=1"
    ]
    script = "install_app.sh"
  }

  provisioner "shell-local" {
    inline = ["zip -r webapp.zip index.js config models opt test usr package-lock.json package.json webapp.service metrics.js logger.js"]
  }

  provisioner "file" {
    source      = "webapp.zip"
    destination = "/tmp/webapp.zip"
  }

  provisioner "file" {
    source      = "cloudwatch-config.json"
    destination = "/tmp/cloudwatch-config.json"
  }

  provisioner "shell" {
    inline = ["ls /", "pwd"]
  }

  provisioner "shell" {
    inline = [
      "cd /opt/csye6225",
      "sudo -u csye6225 mkdir webapp",
      "sudo chown -R csye6225:csye6225 /opt/csye6225/webapp/",
      "sudo -u csye6225 unzip /tmp/webapp.zip -d /opt/csye6225/webapp",
      "cd webapp",
      "sudo -u csye6225 touch application.properties",
      "sudo chown -R csye6225:csye6225 /var/log/"
    ]
  }

  provisioner "shell" {
    scripts = [
      "install_cloudwatch_agent.sh",
      "install_dependencies.sh",
      "systemd.sh"
    ]
  }
}