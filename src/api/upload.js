import apiContentTypeConst from '../constraints/apiContentTypeConst.js';
import apiMethodConst from '../constraints/apiMethodConst.js';
import { checkBodyFilesNotEmpty } from '../common/apiPreCheck.js';
import { SSLCertFiles, updateSSLCert } from '../handler/uploadHandler.js';

const { POST } = apiMethodConst;
const { TYPE_MULTIPART } = apiContentTypeConst;

const needSecret = () => "mAou5820.upload";

export default {
    basePath: "/upload",
    "/SSL/update": {
        disabled: true,
        method: POST,
        acceptType: TYPE_MULTIPART,
        needSecret,
        preCheck: req => checkBodyFilesNotEmpty(req, SSLCertFiles),
        callback: (req, res) => {
            updateSSLCert(req.files)
        }
    }
}