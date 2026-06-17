#!/bin/bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y nginx certbot python3-certbot-nginx curl

id deploy &>/dev/null || useradd -m -s /bin/bash deploy

mkdir -p /opt/thejkhouse /opt/thejkhouse/data /var/www/thejkhouse /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chown -R deploy:deploy /opt/thejkhouse /home/deploy

install -d -m 2775 -o www-data -g deploy /var/www/thejkhouse

cat > /etc/sudoers.d/deploy << 'EOF'
deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart thejkhouse-api, /bin/systemctl reload nginx, /bin/systemctl status thejkhouse-api, /usr/sbin/nginx -t, /usr/bin/rsync
EOF
chmod 440 /etc/sudoers.d/deploy

install -m 644 /dev/stdin /etc/nginx/sites-available/thejkhouse << 'EOF'
server {
    listen 80;
    server_name thejkhouse.com www.thejkhouse.com;

    root /var/www/thejkhouse;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

ln -sf /etc/nginx/sites-available/thejkhouse /etc/nginx/sites-enabled/thejkhouse
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

install -m 644 /dev/stdin /etc/systemd/system/thejkhouse-api.service << 'EOF'
[Unit]
Description=The JK House API
After=network.target

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/opt/thejkhouse
ExecStart=/opt/thejkhouse/thejkhouse-api
Restart=always
RestartSec=5
Environment=PORT=8080
Environment=DATABASE_PATH=/opt/thejkhouse/data/thejkhouse.db
Environment=FIREBASE_PROJECT_ID=the-jk-house

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable thejkhouse-api

install -m 755 /dev/stdin /usr/local/bin/thejkhouse-certbot.sh << 'EOF'
#!/bin/bash
set -euo pipefail

for attempt in $(seq 1 60); do
  if certbot --nginx \
    -d thejkhouse.com \
    -d www.thejkhouse.com \
    --non-interactive \
    --agree-tos \
    --email programmerjake95@gmail.com \
    --redirect; then
    systemctl reload nginx
    exit 0
  fi
  sleep 60
done

exit 1
EOF

nohup /usr/local/bin/thejkhouse-certbot.sh > /var/log/thejkhouse-certbot.log 2>&1 &
