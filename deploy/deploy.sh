#!/bin/bash
DEPLOY_DIR="/home/tushar/FoodFinder/deploy"
WWW_DIR="/var/www/html"

cp "$DEPLOY_DIR/index.html" "$WWW_DIR/products.html"
cp "$DEPLOY_DIR/.htaccess" "$WWW_DIR/.htaccess"
cp -r "$DEPLOY_DIR/data/" "$WWW_DIR/data/"

echo "Deploy complete."
