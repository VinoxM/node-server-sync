import fs from "fs"
import path from 'path'
import { checkBodyKeyNotBlank } from "../../common/apiPreCheck.js"
import apiMethodConst from "../../constraints/apiMethodConst.js"
import { MEDIA_ALLOW_HOSTS as allowHosts } from "../../constraints/mediaConst.js"
import { searchMinio, searchVideos } from "../../handler/media/mediaHandler.js"
import categoriesRep from "../../repository/media/categoriesRep.js"
import authorsRep from "../../repository/media/authorsRep.js"

const { POST, GET } = apiMethodConst

const needSecret = () => "mAou5820.media.video"

export default {
    basePath: "/media",
    "/video/search": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        callback: req => searchVideos(req.body)
    },
    "/video/categoryList": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        callback: () => categoriesRep.selectAll().then(({ data }) => data)
    },
    "/video/authorList": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkBodyKeyNotBlank(req, 'categoryId'),
        callback: req => authorsRep.selectByCategoryId(req.body['categoryId']).then(({ data }) => data)
    },
    "/video/getVideoMinio": {
        method: POST,
        needSecret,
        allowHosts,
        ignoreOutput: true,
        preCheck: req => checkBodyKeyNotBlank(req, 'videoId'),
        callback: req => searchMinio(req.body['videoId'])
    },
    "/index.html": {
        method: GET,
        ignoreReturn: true,
        ignoreSecret: true,
        callback: async (_, res) => {
            const simpleDeploy = __env.get('media.simple-deploy')
            const filePath = path.join(simpleDeploy, 'index.html');
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('服务器内部错误：无法读取文件');
                }
                res.setHeader('Content-Type', 'text/html');
                res.send(data);
            });
        }
    },
}