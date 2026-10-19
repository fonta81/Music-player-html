FROM nginx:alpine



COPY ./index.html /usr/share/nginx/html/index.html
COPY ./css /usr/share/nginx/html/css
COPY ./js /usr/share/nginx/html/js

COPY ./music /usr/share/nginx/html/music

EXPOSE 80
