### 

logs_root="/mnt/logs/${APP_NAME}"

export NODE_ENV=$PRODUCT_ENV

[ -d $logs_root ] || mkdir -p $logs_root

node --version
echo $NODE_ENV
echo `date` && node /app/main.js
# echo "`date` start index.js env ${NODE_ENV}"
# forever -a index.js
# forever -l $logs_root/forever.log -o $logs_root/out.log -e $logs_root/err.log -a index.js


