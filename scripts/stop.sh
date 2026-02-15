#! /bin/bash
WORK_SPACE=$(cd $(dirname "${BASH_SOURCE[0]}")/.. && pwd)
FILE_PATH="$WORK_SPACE/src/application.js"
PID=$(ps -ef | grep $FILE_PATH | grep -v grep | awk '{ print $2 }')
if [ -z $PID ]
then
 echo Application is already stopped
else
 echo kill $PID
 kill -9 $PID
fi