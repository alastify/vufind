<?php
/**
 * Trait to allow AJAX response generation.
 *
 * PHP version 7
 *
 * Copyright (C) Villanova University 2018.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 2,
 * as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * @category VuFind
 * @package  Controller
 * @author   Chris Hallberg <challber@villanova.edu>
 * @license  http://opensource.org/licenses/gpl-2.0.php GNU General Public License
 * @link     https://vufind.org/wiki/development:plugins:controllers Wiki
 */
namespace VuFind\Controller;

use VuFind\AjaxHandler\AjaxHandlerInterface as Ajax;
use VuFind\AjaxHandler\PluginManager;

/**
 * Trait to allow AJAX response generation.
 *
 * Dependencies:
 * - \VuFind\I18n\Translator\TranslatorAwareTrait
 * - Injection of $this->ajaxManager (for some functionality)
 *
 * @category VuFind
 * @package  Controller
 * @author   Chris Hallberg <challber@villanova.edu>
 * @license  http://opensource.org/licenses/gpl-2.0.php GNU General Public License
 * @link     https://vufind.org/wiki/development:plugins:controllers Wiki
 */
trait AjaxResponseTrait
{
    /**
     * Array of PHP errors captured during execution. Add this code to your
     * constructor in order to populate the array:
     *     set_error_handler([static::class, 'storeError']);
     *
     * @var array
     */
    protected static $php_errors = [];

    /**
     * AJAX Handler plugin manager
     *
     * @var PluginManager;
     */
    protected $ajaxManager = null;

    /**
     * Format the content of the AJAX response based on the response type.
     *
     * @param string $type   Content-type of output
     * @param mixed  $data   The response data
     * @param string $status Status of the request
     *
     * @return string
     * @throws \Exception
     */
    protected function formatContent($type, $data, $status)
    {
        switch ($type) {
        case 'application/javascript':
            $output = compact('data', 'status');
            if ('development' == APPLICATION_ENV && count(self::$php_errors) > 0) {
                $output['php_errors'] = self::$php_errors;
            }
            return json_encode($output);
        case 'text/plain':
            return $data ? $status . " $data" : $status;
        case 'text/html':
            return $data ?: '';
        default:
            throw new \Exception("Unsupported content type: $type");
        }
    }

    /**
     * Send output data and exit.
     *
     * @param string $type     Content type to output
     * @param mixed  $data     The response data
     * @param string $status   Status of the request
     * @param int    $httpCode A custom HTTP Status Code
     *
     * @return \Zend\Http\Response
     * @throws \Exception
     */
    protected function getAjaxResponse($type, $data, $status = Ajax::STATUS_OK,
        $httpCode = null
    ) {
        $response = $this->getResponse();
        $headers = $response->getHeaders();
        $headers->addHeaderLine('Content-type', $type);
        $headers->addHeaderLine('Cache-Control', 'no-cache, must-revalidate');
        $headers->addHeaderLine('Expires', 'Mon, 26 Jul 1997 05:00:00 GMT');
        if ($httpCode !== null) {
            $response->setStatusCode($httpCode);
        }
        $response->setContent($this->formatContent($type, $data, $status));
        return $response;
    }

    /**
     * Turn an exception into error response.
     *
     * @param string     $type Content type to output
     * @param \Exception $e    Exception to output.
     *
     * @return \Zend\Http\Response
     */
    protected function getExceptionResponse($type, \Exception $e)
    {
        $debugMsg = ('development' == APPLICATION_ENV)
            ? ': ' . $e->getMessage() : '';
        return $this->getAjaxResponse(
            $type,
            $this->translate('An error has occurred') . $debugMsg,
            Ajax::STATUS_ERROR,
            500
        );
    }

    /**
     * Call an AJAX method and turn the result into a response.
     *
     * @param string $method AJAX method to call
     * @param string $type   Content type to output
     *
     * @return \Zend\Http\Response
     */
    protected function callAjaxMethod($method, $type = 'application/javascript')
    {
        // Check the AJAX handler plugin manager for the method.
        if (!$this->ajaxManager) {
            throw new \Exception('AJAX Handler Plugin Manager missing.');
        }
        if ($this->ajaxManager->has($method)) {
            try {
                $handler = $this->ajaxManager->get($method);
                return $this->getAjaxResponse(
                    $type, ...$handler->handleRequest($this->params())
                );
            } catch (\Exception $e) {
                return $this->getExceptionResponse($type, $e);
            }
        }

        // If we got this far, we can't handle the requested method:
        return $this->getAjaxResponse(
            $type,
            $this->translate('Invalid Method'),
            Ajax::STATUS_ERROR,
            400
        );
    }

    /**
     * Store the errors for later, to be added to the output
     *
     * @param string $errno   Error code number
     * @param string $errstr  Error message
     * @param string $errfile File where error occurred
     * @param string $errline Line number of error
     *
     * @return bool           Always true to cancel default error handling
     */
    public static function storeError($errno, $errstr, $errfile, $errline)
    {
        self::$php_errors[] = "ERROR [$errno] - " . $errstr . "<br />\n"
            . " Occurred in " . $errfile . " on line " . $errline . ".";
        return true;
    }
}
