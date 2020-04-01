import AppConstants from '../../../core/AppConstants';
import {
	hexToBN,
	weiToFiat,
	renderFromWei,
	balanceToFiat,
	renderToGwei,
	isBN,
	renderFromTokenMinimalUnit,
	fromTokenMinimalUnit,
	balanceToFiatNumber,
	weiToFiatNumber,
	addCurrencySymbol,
	toBN
} from '../../../util/number';
import { strings } from '../../../../locales/i18n';
import { renderFullAddress, safeToChecksumAddress } from '../../../util/address';
import { decodeTransferData, isCollectibleAddress, getTicker } from '../../../util/transactions';

const {
	CONNEXT: { CONTRACTS }
} = AppConstants;

export function decodePaymentChannelTx(args) {
	const {
		tx: {
			networkID,
			transactionHash,
			transaction: { value, gas, gasPrice, from, to }
		},
		conversionRate,
		currentCurrency,
		exchangeRate,
		actionKey
	} = args;
	const contract = CONTRACTS[networkID];
	const isDeposit = contract && to.toLowerCase() === contract.toLowerCase();
	const totalEth = hexToBN(value);
	const totalEthFiat = weiToFiat(totalEth, conversionRate, currentCurrency);
	const readableTotalEth = renderFromWei(totalEth);
	const renderTotalEth = `${readableTotalEth} ${isDeposit ? strings('unit.eth') : strings('unit.sai')}`;
	const renderTotalEthFiat = isDeposit
		? totalEthFiat
		: balanceToFiat(parseFloat(readableTotalEth), conversionRate, exchangeRate, currentCurrency);

	const renderFrom = renderFullAddress(from);
	const renderTo = renderFullAddress(to);

	const transactionDetails = {
		renderFrom,
		renderTo,
		transactionHash,
		renderGas: gas ? parseInt(gas, 16).toString() : strings('transactions.tx_details_not_available'),
		renderGasPrice: gasPrice ? renderToGwei(gasPrice) : strings('transactions.tx_details_not_available'),
		renderValue: renderTotalEth,
		renderValueFiat: weiToFiat(totalEth, conversionRate, currentCurrency),
		renderTotalValue: renderTotalEth,
		renderTotalValueFiat: isDeposit && totalEthFiat
	};

	const transactionElement = {
		renderFrom,
		renderTo,
		actionKey,
		value: renderTotalEth,
		fiatValue: renderTotalEthFiat,
		paymentChannelTransaction: true
	};

	return [transactionElement, transactionDetails];
}

function getTokenTransfer(args) {
	const {
		tx: {
			transaction: { to, data }
		},
		conversionRate,
		currentCurrency,
		tokens,
		contractExchangeRates,
		totalGas,
		actionKey
	} = args;

	const [, encodedAmount] = decodeTransferData('transfer', data);

	const amount = toBN(encodedAmount);

	const userHasToken = safeToChecksumAddress(to) in tokens;
	const token = userHasToken ? tokens[safeToChecksumAddress(to)] : null;
	const renderActionKey = token ? `${strings('transactions.sent')} ${token.symbol}` : actionKey;
	const renderTokenAmount = token
		? `${renderFromTokenMinimalUnit(amount, token.decimals)} ${token.symbol}`
		: undefined;
	const exchangeRate = token ? contractExchangeRates[token.address] : undefined;
	let renderTokenFiatAmount, renderTokenFiatNumber;
	if (exchangeRate) {
		renderTokenFiatAmount = balanceToFiat(
			fromTokenMinimalUnit(amount, token.decimals) || 0,
			conversionRate,
			exchangeRate,
			currentCurrency
		);
		renderTokenFiatNumber = balanceToFiatNumber(
			fromTokenMinimalUnit(amount, token.decimals) || 0,
			conversionRate,
			exchangeRate
		);
	}

	const renderToken = token
		? `${renderFromTokenMinimalUnit(amount, token.decimals)} ${token.symbol}`
		: strings('transaction.value_not_available');
	const totalFiatNumber = renderTokenFiatNumber
		? weiToFiatNumber(totalGas, conversionRate) + renderTokenFiatNumber
		: undefined;

	const ticker = getTicker(args.ticker);

	const transactionDetails = {
		renderTotalGas: `${renderFromWei(totalGas)} ${ticker}`,
		renderTotalGasFiat: weiToFiat(totalGas, conversionRate, currentCurrency),
		renderValue: renderToken,
		renderValueFiat: renderTokenFiatAmount ? `${renderTokenFiatAmount}` : undefined,
		renderTotalValue: `${renderToken} ${strings('unit.divisor')} ${renderFromWei(totalGas)} ${ticker}`,
		renderTotalValueFiat: totalFiatNumber ? `${addCurrencySymbol(totalFiatNumber, currentCurrency)}` : undefined
	};

	const transactionElement = {
		actionKey: renderActionKey,
		value: !renderTokenAmount ? strings('transaction.value_not_available') : renderTokenAmount,
		fiatValue: `- ${renderTokenFiatAmount}`
	};

	return [transactionElement, transactionDetails];
}

function getCollectibleTransfer(args) {
	const {
		tx: {
			transaction: { to, data }
		},
		collectibleContracts,
		totalGas
	} = args;
	let actionKey;
	const [, tokenId] = decodeTransferData('transfer', data);
	const collectible = collectibleContracts.find(
		collectible => collectible.address.toLowerCase() === to.toLowerCase()
	);
	if (collectible) {
		actionKey = `${strings('transactions.sent')} ${collectible.name}`;
	} else {
		actionKey = strings('transactions.sent_collectible');
	}

	const renderCollectible = collectible
		? `${strings('unit.token_id')} ${tokenId} ${collectible.symbol}`
		: `${strings('unit.token_id')} ${tokenId}`;

	const transactionDetails = {
		renderValue: renderCollectible,
		renderTotalValue: `${renderCollectible} ${strings('unit.divisor')} ${renderFromWei(totalGas)} ${strings(
			'unit.eth'
		)}`,
		renderTotalValueFiat: undefined
	};

	const transactionElement = {
		actionKey,
		value: `${strings('unit.token_id')}${tokenId}`,
		fiatValue: collectible ? collectible.symbol : undefined
	};

	return [transactionElement, transactionDetails];
}

export async function decodeTransferTx(args) {
	const {
		tx: {
			transaction: { from, gas, gasPrice, data, to },
			transactionHash
		}
	} = args;

	const decodedData = decodeTransferData('transfer', data);
	const addressTo = decodedData[0];
	const isCollectible = await isCollectibleAddress(to, decodedData[1]);

	const gasBN = hexToBN(gas);
	const gasPriceBN = hexToBN(gasPrice);
	const totalGas = isBN(gasBN) && isBN(gasPriceBN) ? gasBN.mul(gasPriceBN) : toBN('0x0');
	const renderGas = parseInt(gas, 16).toString();
	const renderGasPrice = renderToGwei(gasPrice);

	let [transactionElement, transactionDetails] = isCollectible
		? getCollectibleTransfer({ ...args, totalGas })
		: getTokenTransfer({ ...args, totalGas });
	transactionElement = { ...transactionElement, renderTo: addressTo };
	transactionDetails = {
		...transactionDetails,
		...{
			renderFrom: renderFullAddress(from),
			renderTo: renderFullAddress(addressTo),
			transactionHash,
			renderGas,
			renderGasPrice
		}
	};
	return [transactionElement, transactionDetails];
}

export function decodeTransferFromTx(args) {
	const {
		tx: {
			transaction: { gas, gasPrice, data, to },
			transactionHash
		},
		collectibleContracts,
		conversionRate,
		currentCurrency
	} = args;
	const [addressFrom, addressTo, tokenId] = decodeTransferData('transferFrom', data);
	const collectible = collectibleContracts.find(
		collectible => collectible.address.toLowerCase() === to.toLowerCase()
	);
	let actionKey = args.actionKey;
	if (collectible) {
		actionKey = `${strings('transactions.sent')} ${collectible.name}`;
	}

	const gasBN = hexToBN(gas);
	const gasPriceBN = hexToBN(gasPrice);
	const totalGas = isBN(gasBN) && isBN(gasPriceBN) ? gasBN.mul(gasPriceBN) : toBN('0x0');
	const renderCollectible = collectible
		? `${strings('unit.token_id')}${tokenId} ${collectible.symbol}`
		: `${strings('unit.token_id')}${tokenId}`;

	const renderFrom = renderFullAddress(addressFrom);
	const renderTo = renderFullAddress(addressTo);
	const ticker = getTicker(args.ticker);

	const transactionDetails = {
		renderFrom,
		renderTo,
		transactionHash,
		renderValue: renderCollectible,
		renderValueFiat: renderCollectible,
		renderGas: parseInt(gas, 16).toString(),
		renderGasPrice: renderToGwei(gasPrice),
		renderTotalGas: `${renderFromWei(totalGas)} ${ticker}`,
		renderTotalGasFiat: weiToFiat(totalGas, conversionRate, currentCurrency),
		renderTotalValue: `${renderCollectible} ${strings('unit.divisor')} ${renderFromWei(totalGas)} ${ticker}`,
		renderTotalValueFiat: undefined
	};

	const transactionElement = {
		renderTo,
		renderFrom,
		actionKey,
		value: `${strings('unit.token_id')}${tokenId}`,
		fiatValue: collectible ? collectible.symbol : undefined
	};

	return [transactionElement, transactionDetails];
}
