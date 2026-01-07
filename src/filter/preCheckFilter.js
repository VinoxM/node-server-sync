export default {
    order: -50,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        const { preCheck } = config;
        try {
            (preCheck && preCheck(req));
        } catch (error) {
            return reject(error);
        }
        resolve({ req, res, config });
    }
}