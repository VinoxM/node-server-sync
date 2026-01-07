import { TOTP } from "../instance/totp.js";

let totpInstance = null

function getDefaultTOTPInstance() {
    if (totpInstance === null) {
        totpInstance = new TOTP(__env.get('totp'))
    }
    return totpInstance
}

export const generateTOTP = () => getDefaultTOTPInstance().generate()

export const verifyTOTP = token => getDefaultTOTPInstance().verify(token)