export default {
    order: -49,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        const { preHandle } = config;
        try {
            (preHandle && preHandle(req));
        } catch (error) {
            return reject(error);
        }
        resolve({ req, res, config });
    }
}