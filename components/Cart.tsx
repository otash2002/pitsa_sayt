
import React, { useMemo } from 'react';
import { CartItem } from '../types';
import PlusIcon from './icons/PlusIcon';
import MinusIcon from './icons/MinusIcon';
import AnimatedNumber from './AnimatedNumber';

interface CartProps {
    items: CartItem[];
    onUpdateQuantity: (itemId: number, newQuantity: number) => void;
    total: number;
    onOrder: () => void;
    isOpen: boolean;
    onClose: () => void;
}

const Cart: React.FC<CartProps> = ({ items, onUpdateQuantity, total, onOrder, isOpen, onClose }) => {
    
    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl animate-fade-in-up max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Sizning savatchangiz</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <i className="fas fa-times text-2xl"></i>
                    </button>
                </div>
                <div className="p-4 overflow-y-auto">
                    {items.length > 0 ? items.map(item => (
                        <div key={item.itemId} className="flex items-center mb-4">
                            <img src={item.image} alt={item.name} className="w-16 h-16 rounded-lg object-cover mr-4" />
                            <div className="flex-grow">
                                <p className="font-bold text-white">{item.name}</p>
                                <p className="text-sm font-semibold text-yellow-500"><AnimatedNumber value={item.price} formatter={(val) => val.toLocaleString()} /> UZS</p>
                            </div>
                            <div className="flex items-center bg-slate-700 rounded-full">
                                <button onClick={() => onUpdateQuantity(item.itemId, item.quantity - 1)} className="p-2 text-white hover:text-yellow-500">
                                    <MinusIcon className="w-4 h-4" />
                                </button>
                                <span className="px-3 font-bold text-white">{item.quantity}</span>
                                <button onClick={() => onUpdateQuantity(item.itemId, item.quantity + 1)} className="p-2 text-white hover:text-yellow-500">
                                    <PlusIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )) : (
                        <p className="text-center text-gray-400 py-8">Savatingiz bo'sh</p>
                    )}
                </div>
                 <div className="p-4 mt-auto border-t border-slate-700">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-lg font-medium text-gray-300">Jami:</span>
                        <span className="text-2xl font-bold text-yellow-500"><AnimatedNumber value={total} formatter={(val) => val.toLocaleString()} /> UZS</span>
                    </div>
                     <button 
                        onClick={onOrder} 
                        disabled={items.length === 0}
                        className="w-full bg-yellow-500 hover:bg-yellow-600 text-slate-900 font-bold py-3 rounded-lg text-lg transition-transform duration-200 hover:scale-105 disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                        Buyurtma berish
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Cart;