import path from "path";
import child_process from 'child_process';
import { checkBodyKeysNotBlank } from "../common/apiPreCheck.js";
import apiMethodConst from "../constraints/apiMethodConst.js";
import { addTorrent } from "../handler/qbitorrentHandler.js";

const { POST } = apiMethodConst;

const needSecret = () => "mAou5820.qbitTorrent"

export default {
    basePath: "/qbitTorrent",
    "/addTorrent": {
        method: POST,
        needSecret,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['torrent']),
        callback: (req) => {
            // const command = '/usr/bin/qbittorrent-nox'
            // const args = [
            //     req.body.torrent,
            //     `--save-path=${path.join('/media/maou/Database/Downloads/Anime')}`,
            //     `--sequential`,
            //     `--skip-dialog=true`
            // ]
            // console.log(args)
            // child_process.spawnSync(command, args, {
            //     encoding: 'utf-8'
            // })
            return addTorrent(req.body.torrent)
        }
    }
}